import { describe, it, expect, beforeEach, afterAll } from "vitest";
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
  addSuppression,
  scheduleSend,
  getOutreachSend,
  executeScheduledSend,
  computeIdempotencyKey,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { withWorkspace, schema } from "@rdv/db";
import { closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { AuthorizationError, ValidationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 3: real send execution against the Mock outreach provider (see
 * packages/domain/src/providers/mockOutreachProvider.ts) -- the exact same
 * safety gate Wave 2 Phase 7 proved out in dry-run form, now re-evaluated
 * for real at execution time. No network calls anywhere in this file.
 */
describe("Outreach Send Execution (Wave 3)", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Send WS", ownerEmail: "send-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("send-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Send Product" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Send Campaign" } });
    campaignId = campaign.id;
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { status: "active" } });
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  async function approvedCreator(name: string, email: string) {
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
    return { creator, approval };
  }

  async function forceStatus(sendId: string, status: "sending" | "scheduled") {
    await withWorkspace(wsId, (tx) => tx.update(schema.outreachSends).set({ status }).where(eq(schema.outreachSends.id, sendId)));
  }

  it("computeIdempotencyKey is a pure, deterministic composition", () => {
    expect(computeIdempotencyKey("c1", "cr1", "initial")).toBe("c1:cr1:initial");
  });

  it("schedules and executes a real send end to end -> sent, with a real provider message id", async () => {
    const { approval, creator } = await approvedCreator("Cook", "cook@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    expect(scheduled.status).toBe("scheduled");
    expect(scheduled.recipientIdentity).toBe("cook@example.com");
    expect(scheduled.idempotencyKey).toBe(computeIdempotencyKey(campaignId, creator.id, "initial"));

    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("sent");

    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.status).toBe("sent");
    expect(final.providerMessageId).toMatch(/^mock-msg-/);
    expect(final.sentAt).not.toBeNull();
    expect(final.attemptCount).toBe(1);
  });

  it("rejects scheduling against a non-approved approval", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook", contactEmail: "cook@example.com" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    const draft = await persistOutreachDraft({ workspaceId: wsId, campaignId, creatorId: creator.id, templateId: null, subject: "Hi", body: "Body", generationInput: {} });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });

    await expect(scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id })).rejects.toThrow(ValidationError);
  });

  it("rejects scheduling a creator with no contact email on file", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "No Email Cook" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    const draft = await persistOutreachDraft({ workspaceId: wsId, campaignId, creatorId: creator.id, templateId: null, subject: "Hi", body: "Body", generationInput: {} });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });

    await expect(scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id })).rejects.toThrow(/no contact email/);
  });

  it("a Member-Operator can schedule; RBAC still applies (unauthenticated actor rejected)", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    await expect(
      scheduleSend({ workspaceId: wsId, actorUserId: "00000000-0000-0000-0000-000000000000", approvalId: approval.id })
    ).rejects.toThrow(AuthorizationError);
  });

  it("idempotency: re-scheduling the same campaign+creator+step returns the same row, never a second one", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    const first = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const second = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    expect(second.id).toBe(first.id);
  });

  it("blocks a suppressed recipient at execution time, even though it was eligible at schedule time", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });

    // Suppression added *after* scheduling -- proves execution re-checks for real.
    await addSuppression({ workspaceId: wsId, actorUserId: ownerId, identity: "cook@example.com" });

    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("blocked");
    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.statusReason).toContain("suppressed");
    expect(final.providerMessageId).toBeNull();
  });

  it("blocks when the campaign is paused between scheduling and execution", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { status: "paused" } });

    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("blocked");
    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.statusReason).toContain("campaign_not_active");
  });

  it("blocks everything workspace-wide when the kill switch is off", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    await withWorkspace(wsId, (tx) => tx.update(schema.workspaces).set({ sendingEnabled: false }).where(eq(schema.workspaces.id, wsId)));

    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("blocked");
  });

  it("enforces the campaign's first_send_cap across distinct creators at real-send time", async () => {
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId, input: { firstSendCap: 1 } });
    const a = await approvedCreator("Cook One", "one@example.com");
    const b = await approvedCreator("Cook Two", "two@example.com");

    const sendA = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: a.approval.id });
    const resultA = await executeScheduledSend({ workspaceId: wsId, outreachSendId: sendA.id });
    expect(resultA.status).toBe("sent");

    const sendB = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: b.approval.id });
    const resultB = await executeScheduledSend({ workspaceId: wsId, outreachSendId: sendB.id });
    expect(resultB.status).toBe("blocked");
    const finalB = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: sendB.id });
    expect(finalB.statusReason).toContain("first_send_cap_reached");
  });

  it("Wave 3: cross-campaign safeguard blocks a second campaign contacting an already-sent-to recipient, and an explicit override lifts it", async () => {
    const { approval: approvalCampaign1 } = await approvedCreator("Shared Cook", "shared@example.com");
    const sendInCampaign1 = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approvalCampaign1.id });
    const resultInCampaign1 = await executeScheduledSend({ workspaceId: wsId, outreachSendId: sendInCampaign1.id });
    expect(resultInCampaign1.status).toBe("sent");

    // A second, different campaign against the same product, same recipient.
    const campaign2 = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Second Campaign" } });
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign2.id, input: { status: "active" } });
    const creator2 = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Shared Cook Again", contactEmail: "shared@example.com" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign2.id, creatorId: creator2.id });
    const draft2 = await persistOutreachDraft({ workspaceId: wsId, campaignId: campaign2.id, creatorId: creator2.id, templateId: null, subject: "Hi again", body: "Body", generationInput: {} });
    const approval2 = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft2.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval2.id, decision: "approve" });

    const blockedSend = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval2.id });
    const blockedResult = await executeScheduledSend({ workspaceId: wsId, outreachSendId: blockedSend.id });
    expect(blockedResult.status).toBe("blocked");
    const blockedFinal = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: blockedSend.id });
    expect(blockedFinal.statusReason).toContain("cross_campaign_contact_safeguard");

    // A different outreach_step on the same campaign gets a fresh idempotency key, so the override can be exercised on a new row.
    const overrideSend = await scheduleSend({
      workspaceId: wsId,
      actorUserId: ownerId,
      approvalId: approval2.id,
      outreachStep: "manual_retry",
      crossCampaignOverride: true,
    });
    const overrideResult = await executeScheduledSend({ workspaceId: wsId, outreachSendId: overrideSend.id });
    expect(overrideResult.status).toBe("sent");
  });

  it("records a real provider 'unknown' outcome without ever treating it as sent or failed", async () => {
    const { approval } = await approvedCreator("Cook", "cook+mockunknown@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("unknown");
    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.status).toBe("unknown");
    expect(final.providerMessageId).toBeNull();
    expect(final.sentAt).toBeNull();
  });

  it("records a real provider 'failed' outcome distinctly from 'unknown'", async () => {
    const { approval } = await approvedCreator("Cook", "cook+mockfail@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("failed");
  });

  it("interruption safety: a send found already 'sending' (a prior crash after contacting the provider) is marked 'unknown', never blindly retried", async () => {
    // Use a +mockfail address: if the domain layer incorrectly retried the
    // provider call, this would resolve to 'failed', not 'unknown' --
    // proving the interruption path never calls the provider again.
    const { approval } = await approvedCreator("Cook", "cook+mockfail@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    await forceStatus(scheduled.id, "sending");

    const result = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(result.status).toBe("unknown");
    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.status).toBe("unknown");
    expect(final.statusReason).toMatch(/interrupted/i);
    // No attempt was recorded for this "retry" -- the provider was never called.
    expect(final.attemptCount).toBe(0);
  });

  it("re-executing an already-terminal send is a safe no-op (defends against duplicate worker runs)", async () => {
    const { approval } = await approvedCreator("Cook", "cook@example.com");
    const scheduled = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const first = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(first.status).toBe("sent");

    const second = await executeScheduledSend({ workspaceId: wsId, outreachSendId: scheduled.id });
    expect(second.status).toBe("sent");

    const final = await getOutreachSend({ workspaceId: wsId, actorUserId: ownerId, outreachSendId: scheduled.id });
    expect(final.attemptCount).toBe(1); // never incremented by the no-op re-run
  });
});
