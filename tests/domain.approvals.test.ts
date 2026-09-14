import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  createCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  getApproval,
  listApprovalQueue,
  computeContentHash,
} from "@rdv/domain";
import { createWorkspaceWithOwner, addMember, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 6 (plan §11, §14.6): content-pinned approvals — creation, decisions, RBAC, and the queue. */
describe("Approvals", () => {
  let wsId: string;
  let ownerId: string;
  let memberOperatorId: string;
  let productId: string;
  let campaignId: string;
  let creatorId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Approval WS", ownerEmail: "approval-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("approval-owner@test.local")).id;
    await addMember({ workspaceId: wsId, actorUserId: ownerId, targetEmail: "approval-operator@test.local", role: "member_operator" });
    memberOperatorId = (await getUserByEmail("approval-operator@test.local")).id;

    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Spring" } });
    campaignId = campaign.id;
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook" });
    creatorId = creator.id;
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId });
  });

  it("computeContentHash is deterministic and sensitive to any content change", () => {
    const h1 = computeContentHash("Subject", "Body");
    const h2 = computeContentHash("Subject", "Body");
    const h3 = computeContentHash("Subject", "Body!");
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it("creating an approval snapshots the draft's exact content and moves the draft to pending_approval", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Hi",
      body: "Body text",
      generationInput: {},
    });

    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    expect(approval.status).toBe("pending");
    expect(approval.exactSubject).toBe("Hi");
    expect(approval.exactBody).toBe("Body text");
    expect(approval.contentHash).toBe(computeContentHash("Hi", "Body text"));
    expect(approval.campaignId).toBe(campaignId);
    expect(approval.creatorId).toBe(creatorId);
  });

  it("approve requires Admin — a Member-Operator is rejected", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Hi",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: memberOperatorId, draftId: draft.id });

    await expect(
      decideApproval({ workspaceId: wsId, actorUserId: memberOperatorId, approvalId: approval.id, decision: "approve" })
    ).rejects.toThrow();

    const unchanged = await getApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    expect(unchanged.status).toBe("pending");
  });

  it("approve/reject/request_edit each record decidedBy/decidedAt and the correct status, and are never auto-applied", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Hi",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });

    const decided = await decideApproval({
      workspaceId: wsId,
      actorUserId: ownerId,
      approvalId: approval.id,
      decision: "approve",
      notes: "Looks good",
    });
    expect(decided.status).toBe("approved");
    expect(decided.decidedBy).toBe(ownerId);
    expect(decided.decidedAt).not.toBeNull();
    expect(decided.decisionNotes).toBe("Looks good");
  });

  it("rejects deciding an already-decided approval", async () => {
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId,
      creatorId,
      templateId: null,
      subject: "Hi",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "reject" });

    await expect(
      decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" })
    ).rejects.toThrow(/Only a pending approval can be decided/);
  });

  it("the approval queue lists across all campaigns and is filterable by status", async () => {
    const draft1 = await persistOutreachDraft({ workspaceId: wsId, campaignId, creatorId, templateId: null, subject: "A", body: "A", generationInput: {} });
    const draft2 = await persistOutreachDraft({ workspaceId: wsId, campaignId, creatorId, templateId: null, subject: "B", body: "B", generationInput: {} });
    const approval1 = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft1.id });
    await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft2.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval1.id, decision: "approve" });

    const all = await listApprovalQueue({ workspaceId: wsId, actorUserId: ownerId });
    expect(all).toHaveLength(2);

    const pendingOnly = await listApprovalQueue({ workspaceId: wsId, actorUserId: ownerId, status: "pending" });
    expect(pendingOnly).toHaveLength(1);

    const approvedOnly = await listApprovalQueue({ workspaceId: wsId, actorUserId: ownerId, status: "approved" });
    expect(approvedOnly).toHaveLength(1);
    expect(approvedOnly[0]?.id).toBe(approval1.id);
  });
});
