import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createProduct, createCampaign, createManualCreator, shortlistCreator } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

// Importing the worker app's own registry + processor module (not
// spawning the real process), mirroring tests/worker.analyzeProduct.test.ts.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/outreachDraft.js";

/**
 * Wave 2 Phase 6 (plan §11): the full real pipeline (queue -> worker ->
 * registry -> @rdv/domain -> @rdv/ai) for `ai_personalize_outreach`, run
 * through a real BullMQ worker against real local Redis + Postgres. No
 * Anthropic key is configured in this environment, so the job is
 * expected to fail loudly with a clear reason.
 */
describe("Worker — ai_personalize_outreach (Wave 2 Phase 6)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and fails loudly without a configured Anthropic key", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Draft WS", ownerEmail: "worker-draft-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-draft-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker Draft Product" });
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
        "ai_personalize_outreach",
        { workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id, templateId: null },
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
