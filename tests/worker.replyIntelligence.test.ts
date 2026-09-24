import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { ingestInboundMessage } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/replyIntelligence.js";

/**
 * Wave 3: the full real pipeline (queue -> worker -> registry -> @rdv/ai)
 * for `reply_classify_and_suggest`, run through a real BullMQ worker. No
 * Anthropic key is configured in this environment, so — same as every
 * other AI-backed worker test in this build — the job is expected to fail
 * loudly with a clear reason, never silently succeed or hang.
 */
describe("Worker — reply_classify_and_suggest (Wave 3)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured Anthropic key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Reply WS", ownerEmail: "worker-reply-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-reply-owner@test.local")).id;

    const { message } = await ingestInboundMessage({
      workspaceId: ws.id,
      provider: "mock",
      providerMessageId: "worker-reply-msg",
      fromIdentity: "someone@example.com",
      body: "Interested, tell me more.",
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
        "reply_classify_and_suggest",
        { workspaceId: ws.id, actorUserId: ownerId, inboundMessageId: message.id },
        { attempts: 1 }
      );

      const failure = await new Promise((resolve, reject) => {
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) resolve(err);
        });
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) reject(new Error("job unexpectedly completed with no Anthropic key configured"));
        });
        setTimeout(() => reject(new Error("timed out waiting for job failure")), 8000);
      });

      expect((failure as Error).message).toMatch(/No Anthropic API key configured/);
      await job.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
