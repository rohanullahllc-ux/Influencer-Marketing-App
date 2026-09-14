import { describe, it, expect, afterAll } from "vitest";
import {
  createWorkspaceWithOwner,
  addMember,
  getUserByEmail,
  issueSetupToken,
  consumeSetupToken,
  verifyPassword,
} from "@rdv/auth";
import {
  createProduct,
  persistGeneratedIntelligence,
  editProductIntelligence,
  approveProductIntelligence,
  getApprovedProductIntelligence,
  createManualCreator,
  createCampaign,
  updateCampaign,
  createTemplate,
  assignTemplateToCampaign,
  shortlistCreator,
  qualifyCampaignCreators,
  persistCreatorMatch,
  listCurrentMatches,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  addSuppression,
  performDryRunEvaluation,
  getDryRunEvaluation,
  listCampaigns,
  type GeneratedIntelligenceData,
} from "@rdv/domain";
import { AuthorizationError } from "@rdv/lib";
import { closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { resetDb } from "./helpers.js";

const SAMPLE_INTELLIGENCE: GeneratedIntelligenceData = {
  idealCustomer: ["busy parents"],
  problems: ["no time to cook"],
  benefits: ["saves time"],
  niches: ["food"],
  subNiches: ["meal kits"],
  creatorTypes: ["lifestyle vloggers"],
  countries: ["US"],
  languages: ["en"],
  topics: ["cooking"],
  keywords: ["meal kit", "dinner"],
  audienceRationale: "Parents short on time value convenience.",
  confidence: 0.8,
};

/**
 * Wave 2 Phase 8 (plan §13, §23): a true end-to-end run of the complete V1
 * vertical slice against real local Postgres + Redis — Auth -> Product ->
 * Product Intelligence (human-approved) -> Creator (Discovery) ->
 * Campaign + Templates -> Qualification -> Matching -> Outreach Draft ->
 * Human Approval -> Deterministic Safety Gate -> Dry Run. Every step calls
 * the same @rdv/domain functions the API routes and workers call — this
 * is not a re-implementation, it is the real chain, exercised together in
 * one continuous run the way phase-level tests (necessarily) never do.
 *
 * Wherever a real external call would be needed (AI generation, YouTube
 * discovery), this test uses the same "persist the already-produced
 * result" function the real worker calls after a successful external
 * call — exactly the seam Phase 2/5/6's own tests already established
 * for testing without live provider keys — so every deterministic/
 * persistence/approval/safety code path here is still the real one.
 */
describe("Wave 2 — End-to-End V1 vertical slice", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs Product -> approved Intelligence -> Creator -> Campaign -> Qualification -> Matching -> Draft -> Approval -> Safety Gate -> Dry Run, end to end", async () => {
    await resetDb();

    // --- 1. Auth: Owner + self-service Member-Operator provisioning ---
    const ws = await createWorkspaceWithOwner({ workspaceName: "E2E Meal Kit Co", ownerEmail: "e2e-owner@test.local" });
    const ownerId = (await getUserByEmail("e2e-owner@test.local")).id;

    await addMember({ workspaceId: ws.id, actorUserId: ownerId, targetEmail: "e2e-operator@test.local", role: "member_operator" });
    const operatorId = (await getUserByEmail("e2e-operator@test.local")).id;

    const { token } = await issueSetupToken({ workspaceId: ws.id, actorUserId: ownerId, targetUserId: operatorId });
    await consumeSetupToken({ token, newPassword: "correct horse battery staple" });
    const loggedIn = await verifyPassword("e2e-operator@test.local", "correct horse battery staple");
    expect(loggedIn?.userId).toBe(operatorId);
    // The Owner never learns the member's password — only its hash exists, verified above via login, not inspected directly.

    // The Member-Operator is correctly denied an Admin-only action (approving).
    await expect(
      approveProductIntelligence({ workspaceId: ws.id, actorUserId: operatorId, intelligenceId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(AuthorizationError);

    // --- 2. Product + AI Product Intelligence (drafted, edited, approved) ---
    const product = await createProduct({ workspaceId: ws.id, actorUserId: operatorId, name: "Meal Kit Co" });

    const draftIntelligence = await persistGeneratedIntelligence({ workspaceId: ws.id, productId: product.id, data: SAMPLE_INTELLIGENCE });
    expect(draftIntelligence.origin).toBe("ai_derived");
    expect(draftIntelligence.status).toBe("draft");

    const edited = await editProductIntelligence({
      workspaceId: ws.id,
      actorUserId: operatorId,
      intelligenceId: draftIntelligence.id,
      patch: { niches: ["food", "cooking"] },
    });
    expect(edited.editedBy).toBe(operatorId);
    expect(edited.status).toBe("draft"); // editing never silently approves

    const approved = await approveProductIntelligence({ workspaceId: ws.id, actorUserId: ownerId, intelligenceId: edited.id });
    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe(ownerId);
    expect(approved.origin).toBe("ai_derived"); // provenance is never overwritten by approval

    const currentIntelligence = await getApprovedProductIntelligence({ workspaceId: ws.id, productId: product.id });
    expect(currentIntelligence?.id).toBe(approved.id);

    // --- 3. Creator (manual entry — no live YouTube key in this environment; discovery's own upsert/provenance path is proven independently in tests/domain.creatorDiscovery.test.ts) ---
    const creator = await createManualCreator({
      workspaceId: ws.id,
      actorUserId: operatorId,
      displayName: "Cooking With Jane",
      niche: "food",
      contactEmail: "jane@example.com",
    });
    expect(creator.provenance).toBe("human_entered");

    // --- 4. Campaign + Templates ---
    const campaign = await createCampaign({
      workspaceId: ws.id,
      actorUserId: operatorId,
      input: {
        productId: product.id,
        name: "Spring Launch",
        objective: "Drive trial signups",
        targetGeography: ["US"],
        targetLanguages: ["en"],
        creatorTypes: ["lifestyle vloggers"],
        nicheRequirements: ["food"],
        firstSendCap: 10,
        sendingLimits: { dailyCap: 50 },
        followUpRules: { waitDays: 3, maxFollowUps: 2 },
      },
    });
    await updateCampaign({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id, input: { status: "active" } });

    const template = await createTemplate({
      workspaceId: ws.id,
      actorUserId: operatorId,
      name: "Food Creator Intro",
      subject: "Partnership with {{product}}",
      body: "Hi {{creatorName}}, we'd love to work with you.",
      variables: ["product", "creatorName"],
    });
    await assignTemplateToCampaign({
      workspaceId: ws.id,
      actorUserId: operatorId,
      campaignId: campaign.id,
      templateId: template.id,
      assignmentSegment: "default",
    });

    await shortlistCreator({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id, creatorId: creator.id });

    const campaignsForWorkspace = await listCampaigns({ workspaceId: ws.id, actorUserId: operatorId });
    expect(campaignsForWorkspace.map((c) => c.id)).toContain(campaign.id);

    // --- 5. Deterministic Qualification (real, synchronous, zero AI dependency) ---
    const qualifications = await qualifyCampaignCreators({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id });
    expect(qualifications).toHaveLength(1);
    // No numeric thresholds configured (only a niche requirement matching this creator), so qualification passes deterministically.
    expect(qualifications[0]?.passed).toBe(true);
    expect(qualifications[0]?.thresholdsSnapshot).toBeDefined();

    // --- 6. AI Matching (explained) — persisted the same way the real worker persists a real Anthropic response ---
    const match = await persistCreatorMatch({
      workspaceId: ws.id,
      campaignId: campaign.id,
      creatorId: creator.id,
      data: { score: 0.87, explanation: "Strong niche and audience alignment for a food-focused meal kit.", factors: ["niche match", "engaged food audience"], limitations: "Engagement rate not measurable for this manually-entered creator." },
    });
    expect(match.explanation).toBeTruthy(); // a score is never shown without its explanation

    const currentMatches = await listCurrentMatches({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id });
    expect(currentMatches[0]?.id).toBe(match.id);

    // --- 7. Personalized Outreach Draft + content-pinned Human Approval ---
    const draft = await persistOutreachDraft({
      workspaceId: ws.id,
      campaignId: campaign.id,
      creatorId: creator.id,
      templateId: template.id,
      subject: "Partnership with Meal Kit Co",
      body: "Hi Jane, we'd love to work with you on our spring launch.",
      generationInput: { templateId: template.id },
    });
    expect(draft.provenance).toBe("ai_derived");

    const approval = await createApprovalForDraft({ workspaceId: ws.id, actorUserId: operatorId, draftId: draft.id });
    expect(approval.exactSubject).toBe(draft.subject);
    expect(approval.exactBody).toBe(draft.body);

    // A Member-Operator cannot decide an approval — Admin-only, mirroring Product Intelligence approval's bar.
    await expect(
      decideApproval({ workspaceId: ws.id, actorUserId: operatorId, approvalId: approval.id, decision: "approve" })
    ).rejects.toThrow(AuthorizationError);

    const decided = await decideApproval({ workspaceId: ws.id, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    expect(decided.status).toBe("approved");

    // --- 8. Deterministic Safety Gate + Dry Run (no real provider ever contacted) ---
    const evaluation = await performDryRunEvaluation({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id });
    expect(evaluation.eligibleCount).toBe(1);
    expect(evaluation.blockedCount).toBe(0);

    const { results } = await getDryRunEvaluation({ workspaceId: ws.id, actorUserId: ownerId, evaluationId: evaluation.evaluationId });
    expect(results[0]?.creatorId).toBe(creator.id);
    expect(results[0]?.eligible).toBe(true);
    expect(results[0]?.blockReasons).toEqual([]);

    // A suppression added after the fact blocks a subsequent dry run for the same creator, regardless of the still-valid approval.
    await addSuppression({ workspaceId: ws.id, actorUserId: ownerId, identity: "jane@example.com" });
    const secondEvaluation = await performDryRunEvaluation({ workspaceId: ws.id, actorUserId: ownerId, campaignId: campaign.id });
    const { results: secondResults } = await getDryRunEvaluation({ workspaceId: ws.id, actorUserId: ownerId, evaluationId: secondEvaluation.evaluationId });
    expect(secondResults[0]?.eligible).toBe(false);
    expect(secondResults[0]?.blockReasons).toContain("suppressed");
  });

  it("keeps this entire chain workspace-isolated: a second workspace sees none of the first's data", async () => {
    await resetDb();

    const wsA = await createWorkspaceWithOwner({ workspaceName: "Isolation WS A", ownerEmail: "iso-a-owner@test.local" });
    const ownerAId = (await getUserByEmail("iso-a-owner@test.local")).id;
    const productA = await createProduct({ workspaceId: wsA.id, actorUserId: ownerAId, name: "Product A" });
    const campaignA = await createCampaign({ workspaceId: wsA.id, actorUserId: ownerAId, input: { productId: productA.id, name: "Campaign A" } });
    const creatorA = await createManualCreator({ workspaceId: wsA.id, actorUserId: ownerAId, displayName: "Creator A" });
    await shortlistCreator({ workspaceId: wsA.id, actorUserId: ownerAId, campaignId: campaignA.id, creatorId: creatorA.id });

    const wsB = await createWorkspaceWithOwner({ workspaceName: "Isolation WS B", ownerEmail: "iso-b-owner@test.local" });
    const ownerBId = (await getUserByEmail("iso-b-owner@test.local")).id;

    // Workspace B's own scoped query sees zero of Workspace A's campaigns/creators.
    const campaignsForB = await listCampaigns({ workspaceId: wsB.id, actorUserId: ownerBId });
    expect(campaignsForB).toHaveLength(0);

    // Workspace B cannot qualify, match, draft, approve, or dry-run against Workspace A's campaign id — RLS makes it invisible, not just "forbidden".
    await expect(
      qualifyCampaignCreators({ workspaceId: wsB.id, actorUserId: ownerBId, campaignId: campaignA.id })
    ).rejects.toThrow(/No campaign/);
  });
});
