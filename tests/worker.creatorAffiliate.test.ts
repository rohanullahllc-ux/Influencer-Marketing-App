import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createManualCreator, requestAffiliateCreation, getCreatorAffiliate } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/creatorAffiliate.js";

/**
 * Wave 4: the full real pipeline (queue -> worker -> registry ->
 * @rdv/domain -> Mock Whop provider) for `whop_create_affiliate`, run
 * through a real BullMQ worker against real local Redis + Postgres. Like
 * outreach_send_execute against the Mock outreach provider, this makes no
 * external network call, so this demonstrates a genuine successful
 * completion.
 */
describe("Worker — whop_create_affiliate (Wave 4)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end via the real job requestAffiliateCreation enqueues, and completes with a real active result", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Affiliate WS", ownerEmail: "worker-affiliate-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-affiliate-owner@test.local")).id;
    const creator = await createManualCreator({
      workspaceId: ws.id,
      actorUserId: ownerId,
      displayName: "Worker Affiliate Creator",
      contactEmail: "worker-affiliate-creator@example.com",
    });

    const lane = QUEUE_LANES.whopSync;
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
      // requestAffiliateCreation is the real production entry point -- it
      // enqueues the real job itself.
      const affiliate = await requestAffiliateCreation({ workspaceId: ws.id, actorUserId: ownerId, creatorId: creator.id });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for job completion")), 8000);
        worker.on("completed", (completedJob) => {
          if (completedJob.data.creatorAffiliateId === affiliate.id) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.data.creatorAffiliateId === affiliate.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      const final = await getCreatorAffiliate({ workspaceId: ws.id, actorUserId: ownerId, creatorAffiliateId: affiliate.id });
      expect(final.status).toBe("active");
      expect(final.providerAffiliateId).toMatch(/^mock-affiliate-/);

      const jobs = await getQueue(lane).getJobs(["completed"]);
      for (const j of jobs) {
        if (j.data.creatorAffiliateId === affiliate.id) await j.remove();
      }
    } finally {
      await worker.close();
    }
  }, 15000);
});
