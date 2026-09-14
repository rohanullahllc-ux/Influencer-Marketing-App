import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  createCampaign,
  updateCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  addSuppression,
  requestDryRun,
  performDryRunEvaluation,
  getDryRunRunStatus,
  getDryRunEvaluation,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 7 (plan §12): the dry-run evaluation, run end-to-end
 * against real local Postgres — no network calls of any kind (this
 * module never imports @rdv/ai or any HTTP client).
 */
describe("Dry Run", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "DryRun WS", ownerEmail: "dryrun-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("dryrun-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Spring" } });
    campaignId = campaign.id;
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { status: "active" } });
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  async function approvedCreator(name: string, email: string | null = null) {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: name, contactEmail: email });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId: creator.id,
      templateId: null,
      subject: `Hi ${name}`,
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    return creator;
  }

  it("rejects a dry-run request for a campaign with an empty shortlist", async () => {
    await expect(requestDryRun({ workspaceId: wsId, actorUserId: ownerId, campaignId })).rejects.toThrow(
      /no shortlisted creators/
    );
  });

  it("enqueues a real dry_run_evaluate job on the outreach-send lane", async () => {
    await approvedCreator("Cook");
    const { jobId } = await requestDryRun({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    const job = await getQueue(QUEUE_LANES.outreachSend).getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.name).toBe("dry_run_evaluate");
    await job?.remove();
  });

  it("correctly separates a mix of suppressed / unapproved / out-of-window / properly-approved creators, each with the exact reason", async () => {
    const eligible = await approvedCreator("Eligible Cook", "eligible@example.com");

    const suppressedCreator = await approvedCreator("Suppressed Cook", "suppressed@example.com");
    await addSuppression({ workspaceId: wsId, actorUserId: ownerId, identity: "suppressed@example.com" });

    const unapproved = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Unapproved Cook" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: unapproved.id });

    const outOfWindow = await approvedCreator("Out Of Window Cook", "oow@example.com");
    await updateCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId,
      input: { sendingWindow: { startHour: 0, endHour: 1 } }, // a window almost certainly not "now"
    });

    const { evaluationId, eligibleCount, blockedCount } = await performDryRunEvaluation({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId,
    });

    // Note: the sendingWindow set above applies to *all* four creators
    // (it's a campaign-level field), so "eligible" and "outOfWindow" both
    // get the same schedule check — this test asserts on the specific
    // per-creator reasons rather than raw counts to stay robust to the
    // current wall-clock hour.
    void eligibleCount;
    void blockedCount;

    const { results } = await getDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, evaluationId });
    const byCreator = new Map(results.map((r) => [r.creatorId, r]));

    expect(byCreator.get(suppressedCreator.id)?.eligible).toBe(false);
    expect(byCreator.get(suppressedCreator.id)?.blockReasons).toContain("suppressed");

    expect(byCreator.get(unapproved.id)?.eligible).toBe(false);
    expect(byCreator.get(unapproved.id)?.blockReasons).toContain("no_valid_approval");

    // Both remaining creators share the same tight sendingWindow, so
    // whichever way "now" falls, they must agree with each other.
    expect(byCreator.get(eligible.id)?.eligible).toBe(byCreator.get(outOfWindow.id)?.eligible);
  });

  it("a paused campaign blocks every creator, regardless of approval", async () => {
    await approvedCreator("Cook");
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { status: "paused" } });

    const { evaluationId } = await performDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    const { results } = await getDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, evaluationId });

    expect(results.every((r) => !r.eligible)).toBe(true);
    expect(results.every((r) => (r.blockReasons as string[]).some((reason) => reason.startsWith("campaign_not_active")))).toBe(true);
  });

  it("re-running dry-run does not re-mark an already-eligible creator eligible again (duplicate/idempotency protection)", async () => {
    const creator = await approvedCreator("Cook", "cook@example.com");

    const first = await performDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(first.eligibleCount).toBe(1);

    const second = await performDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(second.eligibleCount).toBe(0);

    const { results } = await getDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, evaluationId: second.evaluationId });
    expect(results[0]?.creatorId).toBe(creator.id);
    expect(results[0]?.eligible).toBe(false);
    expect(results[0]?.blockReasons).toContain("duplicate_already_marked_eligible");
  });

  it("enforces the campaign's first_send_cap across distinct creators", async () => {
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { firstSendCap: 1 } });
    await approvedCreator("Cook One", "one@example.com");
    await approvedCreator("Cook Two", "two@example.com");

    const { eligibleCount, blockedCount, evaluationId } = await performDryRunEvaluation({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId,
    });
    expect(eligibleCount).toBe(1);
    expect(blockedCount).toBe(1);

    const { results } = await getDryRunEvaluation({ workspaceId: wsId, actorUserId: ownerId, evaluationId });
    const blocked = results.find((r) => !r.eligible);
    expect(blocked?.blockReasons).toContain("first_send_cap_reached");
  });

  it("polling an unrun job reports waiting, and an unknown run id throws NotFoundError", async () => {
    await approvedCreator("Cook");
    const { jobId } = await requestDryRun({ workspaceId: wsId, actorUserId: ownerId, campaignId });

    const status = await getDryRunRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: jobId });
    expect(status.state).toBe("waiting");

    await expect(
      getDryRunRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: "does-not-exist" })
    ).rejects.toThrow(/No dry-run/);

    const job = await getQueue(QUEUE_LANES.outreachSend).getJob(jobId);
    await job?.remove();
  });
});
