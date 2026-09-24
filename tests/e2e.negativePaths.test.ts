import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import {
  createProduct,
  createCampaign,
  updateCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  editOutreachDraft,
  scheduleSend,
  executeScheduledSend,
  getOutreachSend,
  requestAffiliateCreation,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { withWorkspace, schema } from "@rdv/db";
import { QUEUE_LANES, getQueue, getRedisConnection, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { AuthorizationError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 7 (Complete End-to-End V1 Validation — failure paths): each
 * scenario in the mission's negative-path list is already covered by a
 * dedicated per-feature test (interruption safety, unknown/failed
 * provider outcome, duplicate send/reply, suppression, kill switch, RBAC,
 * cross-workspace RLS, and AI-failure-without-a-key across all six AI
 * operations' own worker tests). This file closes the two gaps that
 * specifically require *chaining two already-tested features together* —
 * a cross-feature interaction neither feature's own test exercises on
 * its own — plus one true infrastructure-failure scenario (a retry that
 * fails again is not silently lost).
 */
describe("Wave 7 — negative/failure paths", () => {
  let wsId: string;
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Negative Paths WS", ownerEmail: "negpath-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("negpath-owner@test.local")).id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("a stale (invalidated) approval cannot be scheduled for sending -- content-pinning and the send safety gate must agree", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Stale Approval Product" });
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId: product.id, name: "Stale Approval Campaign" } });
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, input: { status: "active" } });
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Stale Cook", contactEmail: "stale@example.com" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });

    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId: campaign.id,
      creatorId: creator.id,
      templateId: null,
      subject: "Original subject",
      body: "Original body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    const decided = await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    expect(decided.status).toBe("approved");

    // Editing the draft after approval invalidates it (Wave 2 Phase 6's
    // own acceptance criterion, re-verified here as a precondition).
    await editOutreachDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id, body: "A materially different body" });

    // The cross-feature check this test actually exists for: the now-stale
    // approval must be rejected by the real send-scheduling entry point,
    // not just marked invalidated in isolation.
    await expect(
      scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id })
    ).rejects.toThrow(ValidationError);
  });

  it("an admin-only affiliate-creation attempt by a lower-privileged actor never reaches the provider (permission check happens before any external call)", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Perm Cook", contactEmail: "perm@example.com" });
    await expect(
      requestAffiliateCreation({ workspaceId: wsId, actorUserId: "00000000-0000-0000-0000-000000000000", creatorId: creator.id })
    ).rejects.toThrow(AuthorizationError);

    // No creator_affiliates row was created at all -- the rejection is
    // total, not a partial/rolled-back side effect.
    const rows = await withWorkspace(wsId, (tx) => tx.select().from(schema.creatorAffiliates).where(eq(schema.creatorAffiliates.creatorId, creator.id)));
    expect(rows).toHaveLength(0);
  });

  it("a real send failure surfaces distinctly from an unknown outcome, and re-executing a terminal 'failed' send is a safe no-op (never silently retried into a duplicate)", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Failure Product" });
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId: product.id, name: "Failure Campaign" } });
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, input: { status: "active" } });
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Fail Cook", contactEmail: "cook+mockfail@example.com" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    const draft = await persistOutreachDraft({ workspaceId: wsId, campaignId: campaign.id, creatorId: creator.id, templateId: null, subject: "Hi", body: "Body", generationInput: {} });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });

    const send = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const first = await executeScheduledSend({ workspaceId: wsId, outreachSendId: send.id });
    expect(first.status).toBe("failed");

    const second = await executeScheduledSend({ workspaceId: wsId, outreachSendId: send.id });
    expect(second.status).toBe("failed"); // terminal no-op, not a retry into 'sent'
    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: send.id });
    expect(final.attemptCount).toBe(1); // the no-op re-run never incremented this
  });

  it("job reliability: a retried job that fails again is not silently lost -- it remains a real, visible failed job", async () => {
    const lane = QUEUE_LANES.webhookIngest;
    const queue = getQueue(lane);

    let failCount = 0;
    const worker = new Worker(
      lane,
      async (job) => {
        if (job.name !== "negpath_retry_probe") throw new Error(`unexpected job name ${job.name}`);
        failCount++;
        throw new Error(`deliberate failure #${failCount}`);
      },
      { connection: getRedisConnection() }
    );

    try {
      const job = await queue.add("negpath_retry_probe", { probe: true }, { attempts: 1 });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for first failure")), 8000);
        worker.on("failed", (failedJob) => {
          if (failedJob?.id === job.id) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      expect(failCount).toBe(1);

      await job.retry("failed");

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("timed out waiting for second failure")), 8000);
        worker.on("failed", (failedJob) => {
          if (failedJob?.id === job.id && failCount === 2) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      const state = await job.getState();
      expect(state).toBe("failed"); // still a real, visible failed job -- never silently dropped
      const refetched = await queue.getJob(job.id!);
      expect(refetched?.failedReason).toContain("deliberate failure #2");

      await job.remove();
    } finally {
      await worker.close();
    }
  }, 20000);
});
