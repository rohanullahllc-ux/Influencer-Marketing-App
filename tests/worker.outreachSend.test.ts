import { describe, it, expect, afterAll } from "vitest";
import { Worker } from "bullmq";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import {
  createProduct,
  createCampaign,
  updateCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  scheduleSend,
  getOutreachSend,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/outreachSend.js";

/**
 * Wave 3: the full real pipeline (queue -> worker -> registry ->
 * @rdv/domain -> Mock outreach provider) for `outreach_send_execute`, run
 * through a real BullMQ worker against real local Redis + Postgres. Like
 * dry_run_evaluate, this job makes no external network call (the Mock
 * provider is local and deterministic), so this demonstrates a genuine
 * successful completion, not just a "fails loudly without a key" proof.
 */
describe("Worker — outreach_send_execute (Wave 3)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end via the real delayed job scheduleSend enqueues, and completes with a real sent result", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker Send WS", ownerEmail: "worker-send-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-send-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker Send Product" });
    const campaign = await createCampaign({ workspaceId: ws.id, actorUserId: ownerId, input: { productId: product.id, name: "Worker Send Campaign" } });
    await updateCampaign({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, input: { status: "active" } });

    const creator = await createManualCreator({ workspaceId: ws.id, actorUserId: ownerId, displayName: "Worker Send Creator", contactEmail: "worker-send-creator@example.com" });
    await shortlistCreator({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    const draft = await persistOutreachDraft({ workspaceId: ws.id, campaignId: campaign.id, creatorId: creator.id, templateId: null, subject: "Hi Worker Send Creator", body: "Body", generationInput: {} });
    const approval = await createApprovalForDraft({ workspaceId: ws.id, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: ws.id, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });

    const lane = QUEUE_LANES.outreachSend;
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
      // scheduleSend is the real production entry point -- it enqueues the
      // real job itself; this test does not construct the job by hand.
      const send = await scheduleSend({ workspaceId: ws.id, actorUserId: ownerId, approvalId: approval.id });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for job completion")), 8000);
        worker.on("completed", (completedJob) => {
          if (completedJob.data.outreachSendId === send.id) {
            clearTimeout(timeout);
            resolve();
          }
        });
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.data.outreachSendId === send.id) {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      const final = await getOutreachSend({ workspaceId: ws.id, actorUserId: ownerId, outreachSendId: send.id });
      expect(final.status).toBe("sent");
      expect(final.providerMessageId).toMatch(/^mock-msg-/);

      // Clean up the real, shared-Redis job so it doesn't linger.
      const jobs = await getQueue(lane).getJobs(["completed"]);
      for (const j of jobs) {
        if (j.data.outreachSendId === send.id) await j.remove();
      }
    } finally {
      await worker.close();
    }
  }, 15000);
});
