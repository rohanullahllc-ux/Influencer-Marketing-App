import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  persistGeneratedIntelligence,
  approveProductIntelligence,
  createCampaign,
  createManualCreator,
  shortlistCreator,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
} from "@rdv/domain";
import { createWorkspaceWithOwner, addMember, getUserByEmail } from "@rdv/auth";
import { AuthorizationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 6 (RBAC hardening audit): the two highest-stakes "human approval
 * boundary" actions in the whole product — approving Product Intelligence
 * (making AI-derived data authoritative) and deciding an outreach approval
 * (the action that makes a message eligible to send) — are both
 * documented admin-only, but neither had a test proving a lower-privilege
 * Member-Operator is actually rejected. A regression here would be silent
 * (nothing else exercises this exact boundary), so it's the first thing
 * this audit closes. Mirrors requestAffiliateCreation's existing
 * admin-only rejection test in tests/domain.creatorAffiliate.test.ts.
 */
describe("RBAC hardening: admin-only human approval boundaries (Wave 6)", () => {
  let wsId: string;
  let ownerId: string;
  let memberOperatorId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "RBAC Hardening WS", ownerEmail: "rbac-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("rbac-owner@test.local")).id;
    await addMember({ workspaceId: wsId, actorUserId: ownerId, targetEmail: "rbac-operator@test.local", role: "member_operator" });
    memberOperatorId = (await getUserByEmail("rbac-operator@test.local")).id;
  });

  it("a Member-Operator cannot approve Product Intelligence (admin-only)", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "RBAC Product" });
    const draft = await persistGeneratedIntelligence({
      workspaceId: wsId,
      productId: product.id,
      data: {
        idealCustomer: ["x"],
        problems: [],
        benefits: [],
        niches: [],
        subNiches: [],
        creatorTypes: [],
        countries: [],
        languages: [],
        topics: [],
        keywords: [],
        audienceRationale: "x",
        confidence: 0.5,
      },
    });

    await expect(
      approveProductIntelligence({ workspaceId: wsId, actorUserId: memberOperatorId, intelligenceId: draft.id })
    ).rejects.toThrow(AuthorizationError);

    // An Owner (outranks admin) can.
    const approved = await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draft.id });
    expect(approved.status).toBe("approved");
  });

  it("a Member-Operator cannot decide (approve/reject) an outreach approval (admin-only)", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "RBAC Product 2" });
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId: product.id, name: "RBAC Campaign" } });
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "RBAC Cook", contactEmail: "rbac-cook@example.com" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId: campaign.id,
      creatorId: creator.id,
      templateId: null,
      subject: "Hi",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });

    await expect(
      decideApproval({ workspaceId: wsId, actorUserId: memberOperatorId, approvalId: approval.id, decision: "approve" })
    ).rejects.toThrow(AuthorizationError);

    // Confirm it's still genuinely pending -- the rejected call had zero effect.
    const stillPending = await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    expect(stillPending.status).toBe("approved");
  });
});
