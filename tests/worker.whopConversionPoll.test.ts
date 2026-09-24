import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { createManualCreator, requestAffiliateCreation, executeAffiliateCreation } from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/whopConversionPoll.js";

/**
 * Wave 4: the real `whop_conversion_poll` job run through a real BullMQ
 * worker. Against the Mock provider there are no real conversions to
 * report -- this test proves the job genuinely walks the real `active`
 * affiliate and calls the provider abstraction for real (not that it
 * fabricates data), same spirit as replyReconciliationPoll's test.
 */
describe("Worker — whop_conversion_poll (Wave 4)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and honestly reports zero new conversions from the Mock provider", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Poll WS", ownerEmail: "worker-poll-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-poll-owner@test.local")).id;
    const creator = await createManualCreator({
      workspaceId: ws.id,
      actorUserId: ownerId,
      displayName: "Worker Poll Creator",
      contactEmail: "worker-poll-creator@example.com",
    });
    const affiliate = await requestAffiliateCreation({ workspaceId: ws.id, actorUserId: ownerId, creatorId: creator.id });
    await executeAffiliateCreation({ workspaceId: ws.id, creatorAffiliateId: affiliate.id });

    const lane = QUEUE_LANES.whopSync;
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
      const job = await queue.add("whop_conversion_poll", { workspaceId: ws.id }, { attempts: 1 });

      const returnValue = await new Promise<{ affiliatesPolled: number; newConversions: number }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for job completion")), 8000);
        worker.on("completed", (completedJob) => {
          if (completedJob.id === job.id) {
            clearTimeout(timeout);
            resolve(completedJob.returnvalue);
          }
        });
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === job.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      expect(returnValue.affiliatesPolled).toBe(1);
      expect(returnValue.newConversions).toBe(0);
      await job.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
