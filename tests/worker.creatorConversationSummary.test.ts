import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createManualCreator, ingestInboundMessage } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/creatorConversationSummary.js";

/**
 * Wave 4: the full real pipeline (queue -> worker -> registry -> @rdv/ai)
 * for `summarize_creator_conversation`, run through a real BullMQ worker.
 * No DeepSeek key is configured in this environment, so — same as every
 * other AI-backed worker test in this build — the job is expected to fail
 * loudly with a clear reason, never silently succeed or hang.
 */
describe("Worker — summarize_creator_conversation (Wave 4)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured DeepSeek key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Summary WS", ownerEmail: "worker-summary-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-summary-owner@test.local")).id;
    const creator = await createManualCreator({
      workspaceId: ws.id,
      actorUserId: ownerId,
      displayName: "Worker Summary Creator",
      contactEmail: "worker-summary-creator@example.com",
    });
    // Give the job real history to attempt to summarize (an empty thread
    // would fail for a different, non-AI reason).
    await ingestInboundMessage({
      workspaceId: ws.id,
      provider: "mock",
      providerMessageId: "worker-summary-msg",
      fromIdentity: "worker-summary-creator@example.com",
      body: "Sounds interesting, tell me more about rates.",
      receivedAt: new Date(),
    });

    const lane = QUEUE_LANES.aiOps;
    const queue = getQueue(lane);
    const worker = new Worker(
      lane,
      async (job) => {
        const handler = getJobProcessor(lane, job.name);
        if (!handler) throw new Error(`No processor for ${job.name}`);
        return handler(job.data, job);
      },
      { connection: getRedisConnection() }
    );

    try {
      const job = await queue.add(
        "summarize_creator_conversation",
        { workspaceId: ws.id, actorUserId: ownerId, creatorId: creator.id },
        { attempts: 1 }
      );

      const failure = await new Promise((resolve, reject) => {
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) resolve(err);
        });
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) reject(new Error("job unexpectedly completed with no DeepSeek key configured"));
        });
        setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      });

      expect((failure as Error).message).toMatch(/No DeepSeek API key configured/);
      await job.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
