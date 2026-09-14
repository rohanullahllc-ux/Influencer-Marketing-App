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
  requestDryRun,
  getDryRunEvaluation,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

// Importing the worker app's own registry + processor module (not
// spawning the real process), mirroring tests/worker.creatorMatching.test.ts.
import { getJobProcessor } from "../apps/worker/src/registry.js";
import "../apps/worker/src/processors/dryRun.js";

/**
 * Wave 2 Phase 7 (plan §12): the full real pipeline (queue -> worker ->
 * registry -> @rdv/domain) for `dry_run_evaluate`, run through a real
 * BullMQ worker against real local Redis + Postgres. Unlike every other
 * AI-backed worker test in this build, this job makes no external network
 * call at all, so this test demonstrates a genuine successful completion.
 */
describe("Worker — dry_run_evaluate (Wave 2 Phase 7)", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the real registered handler end-to-end and completes with a real eligible result, no network calls", async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Worker DryRun WS", ownerEmail: "worker-dryrun-owner@test.local" });
    const ownerId = (await getUserByEmail("worker-dryrun-owner@test.local")).id;
    const product = await createProduct({ workspaceId: ws.id, actorUserId: ownerId, name: "Worker DryRun Product" });
    const campaign = await createCampaign({ workspaceId: ws.id, actorUserId: ownerId, input: { productId: product.id, name: "Test Campaign" } });
    await updateCampaign({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, input: { status: "active" } });

    const creator = await createManualCreator({ workspaceId: ws.id, actorUserId: ownerId, displayName: "Test Creator", contactEmail: "worker-dryrun-creator@example.com" });
    await shortlistCreator({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    const draft = await persistOutreachDraft({
      workspaceId: ws.id,
      campaignId: campaign.id,
      creatorId: creator.id,
      templateId: null,
      subject: "Hi Test Creator",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: ws.id, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: ws.id, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });

    const lane = QUEUE_LANES.outreachSend;
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
      const { jobId } = await requestDryRun({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id });

      const result = await new Promise((resolve, reject) => {
        worker.on("completed", (completedJob, returnvalue) => {
          if (completedJob.id === jobId) resolve(returnvalue);
        });
        worker.on("failed", (failedJob, err) => {
          if (failedJob?.id === jobId) reject(err);
        });
        setTimeout(() => reject(new Error("timed out waiting for job completion")), 8000);
      });

      const typed = result as { evaluationId: string; eligibleCount: number; blockedCount: number };
      expect(typed.eligibleCount).toBe(1);
      expect(typed.blockedCount).toBe(0);

      const { results } = await getDryRunEvaluation({ workspaceId: ws.id, actorUserId: ownerId, evaluationId: typed.evaluationId });
      expect(results[0]?.eligible).toBe(true);

      const job = await queue.getJob(jobId);
      await job?.remove();
    } finally {
      await worker.close();
    }
  }, 15000);
});
