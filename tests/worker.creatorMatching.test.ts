import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createProduct, createCampaign, createManualCreator, shortlistCreator } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

// Importing the worker app's own registry + processor module (not
// spawning the real process), mirroring tests/worker.analyzeProduct.test.ts.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/creatorMatching.js";

/**
 * Wave 2 Phase 5 (plan §10): the full real pipeline (queue -> worker ->
 * registry -> @rdv/domain -> @rdv/ai) for `ai_explain_match`, run through
 * a real BullMQ worker against real local Redis + Postgres. No DeepSeek
 * key is configured in this environment, so the job is expected to fail
 * loudly with a clear reason.
 */
describe("Worker — ai_explain_match (Wave 2 Phase 5)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured DeepSeek key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Match WS", ownerEmail: "worker-match-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-match-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker Match Product" });
    const campaign = await createCampaign({ workspaceId: ws.id, actorUserId: ownerId, input: { productId: product.id, name: "Test Campaign" } });
    const creator = await createManualCreator({ workspaceId: ws.id, actorUserId: ownerId, displayName: "Test Creator" });
    await shortlistCreator({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });

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
        "ai_explain_match",
        { workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id },
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
