import { describe, it, expect, afterAll } from "vitest";
import { createWorkspaceWithOwner, addMember, getUserByEmail } from "@rdv/auth";
import {
  createProduct,
  persistGeneratedIntelligence,
  approveProductIntelligence,
  createManualCreator,
  createCampaign,
  updateCampaign,
  shortlistCreator,
  qualifyCampaignCreators,
  persistCreatorMatch,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  scheduleSend,
  executeScheduledSend,
  getOutreachSend,
  ingestInboundMessage,
  persistReplyClassification,
  getCreatorRelationship,
  updateCreatorRelationship,
  addCreatorNote,
  createCreatorTask,
  getCreatorHistory,
  requestAffiliateCreation,
  executeAffiliateCreation,
  ingestWhopConversion,
  listConversionsForAffiliate,
  getWorkspaceAnalytics,
  getCampaignAnalytics,
  type GeneratedIntelligenceData,
} from "@rdv/domain";
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
 * Wave 7 (Complete End-to-End V1 Validation): the FULL real chain in one
 * continuous run — Product -> Product Intelligence (human-approved) ->
 * Creator Discovery -> Qualification -> Matching -> Campaign -> Creator
 * Selection -> Outreach Draft -> human Approval -> Safety Gate -> Send
 * Execution -> Reply Ingestion -> Reply Intelligence -> Creator CRM ->
 * human-triggered Affiliate workflow -> Conversion -> Analytics.
 *
 * tests/e2e.wave2.test.ts already proves the Product->DryRun portion in
 * detail (RBAC boundaries, content-pinning, provenance); this test
 * doesn't re-litigate those specifics, it continues past where that test
 * stops (real Send Execution) through every remaining V1 build area,
 * using the exact same "persist the already-produced external result"
 * seam for the two steps that need a real external provider (AI matching,
 * AI reply classification) that Wave 2's own E2E test established --
 * every other step calls the real, unmodified @rdv/domain function the
 * actual API routes and workers call. No fake parallel test-only
 * architecture anywhere in this file.
 */
describe("Wave 7 — Complete End-to-End V1 Validation", () => {
  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("runs the full real chain: Product -> Intelligence -> Discovery -> Qualification -> Matching -> Campaign -> Draft -> Approval -> Safety Gate -> Send -> Reply -> Reply Intelligence -> CRM -> Affiliate -> Conversion -> Analytics", async () => {
    await resetDb();

    // --- Auth ---
    const ws = await createWorkspaceWithOwner({ workspaceName: "E2E V1 Meal Kit Co", ownerEmail: "e2ev1-owner@test.local" });
    const ownerId = (await getUserByEmail("e2ev1-owner@test.local")).id;
    await addMember({ workspaceId: ws.id, actorUserId: ownerId, targetEmail: "e2ev1-operator@test.local", role: "member_operator" });
    const operatorId = (await getUserByEmail("e2ev1-operator@test.local")).id;

    // --- Product + Product Intelligence (AI-drafted, human-approved) ---
    const product = await createProduct({ workspaceId: ws.id, actorUserId: operatorId, name: "Meal Kit Co" });
    const draftIntelligence = await persistGeneratedIntelligence({ workspaceId: ws.id, productId: product.id, data: SAMPLE_INTELLIGENCE });
    const approvedIntelligence = await approveProductIntelligence({ workspaceId: ws.id, actorUserId: ownerId, intelligenceId: draftIntelligence.id });
    expect(approvedIntelligence.status).toBe("approved");

    // --- Creator Discovery (manual entry stands in for the real YouTube path here -- discovery's own upsert/provenance behavior is proven independently in tests/domain.creatorDiscovery.test.ts) ---
    const creator = await createManualCreator({
      workspaceId: ws.id,
      actorUserId: operatorId,
      displayName: "Cooking With Jane",
      niche: "food",
      contactEmail: "jane@example.com",
    });

    // --- Campaign + Creator Selection ---
    const campaign = await createCampaign({
      workspaceId: ws.id,
      actorUserId: operatorId,
      input: { productId: product.id, name: "Spring Launch", nicheRequirements: ["food"], firstSendCap: 10 },
    });
    await updateCampaign({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id, input: { status: "active" } });
    await shortlistCreator({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id, creatorId: creator.id });

    // --- Deterministic Qualification ---
    const qualifications = await qualifyCampaignCreators({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id });
    expect(qualifications[0]?.passed).toBe(true);

    // --- AI Matching (persisted the same way the real worker persists a real Anthropic response) ---
    const match = await persistCreatorMatch({
      workspaceId: ws.id,
      campaignId: campaign.id,
      creatorId: creator.id,
      data: { score: 0.87, explanation: "Strong niche and audience alignment.", factors: ["niche match"], limitations: null },
    });
    expect(match.score).toBe("0.87");

    // --- Personalized Outreach Draft + content-pinned human Approval ---
    const draft = await persistOutreachDraft({
      workspaceId: ws.id,
      campaignId: campaign.id,
      creatorId: creator.id,
      templateId: null,
      subject: "Partnership with Meal Kit Co",
      body: "Hi Jane, we'd love to work with you.",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: ws.id, actorUserId: operatorId, draftId: draft.id });
    const decidedApproval = await decideApproval({ workspaceId: ws.id, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });
    expect(decidedApproval.status).toBe("approved");

    // --- Safety Gate + real Send Execution (against the real Mock outreach provider) ---
    const send = await scheduleSend({ workspaceId: ws.id, actorUserId: operatorId, approvalId: approval.id });
    expect(send.status).toBe("scheduled");
    const sendResult = await executeScheduledSend({ workspaceId: ws.id, outreachSendId: send.id });
    expect(sendResult.status).toBe("sent");
    const finalSend = await getOutreachSend({ workspaceId: ws.id, actorUserId: operatorId, outreachSendId: send.id });
    expect(finalSend.providerMessageId).toMatch(/^mock-msg-/);

    // --- Reply Ingestion (real, verbatim, matched to the real send above) ---
    const { message: reply } = await ingestInboundMessage({
      workspaceId: ws.id,
      provider: "mock",
      providerMessageId: "e2ev1-reply-1",
      fromIdentity: "jane@example.com",
      subject: "Re: Partnership with Meal Kit Co",
      body: "This sounds great, tell me more about rates!",
      receivedAt: new Date(),
    });
    expect(reply.matchStatus).toBe("matched"); // a real prior 'sent' row for this exact creator exists
    expect(reply.creatorId).toBe(creator.id);
    expect(reply.campaignId).toBe(campaign.id);

    // --- Reply Intelligence (persisted the same way the real worker persists a real Anthropic classification) ---
    const classified = await persistReplyClassification({
      workspaceId: ws.id,
      actorUserId: operatorId,
      inboundMessageId: reply.id,
      classification: "interested",
      confidence: 0.92,
      limitations: null,
      extractedFacts: ["asked about rates"],
      suggestedDraftId: null,
    });
    expect(classified.classification).toBe("interested");

    // --- Creator CRM: relationship, notes, tasks, real history ---
    const initialRelationship = await getCreatorRelationship({ workspaceId: ws.id, actorUserId: operatorId, creatorId: creator.id });
    expect(initialRelationship.status).toBe("new");
    const updatedRelationship = await updateCreatorRelationship({
      workspaceId: ws.id,
      actorUserId: operatorId,
      creatorId: creator.id,
      status: "in_conversation",
      nextAction: "Send rate sheet",
    });
    expect(updatedRelationship.status).toBe("in_conversation");
    await addCreatorNote({ workspaceId: ws.id, actorUserId: operatorId, creatorId: creator.id, body: "Replied fast, seems genuinely interested." });
    const task = await createCreatorTask({ workspaceId: ws.id, actorUserId: operatorId, creatorId: creator.id, title: "Send rate sheet" });
    expect(task.status).toBe("open");

    const history = await getCreatorHistory({ workspaceId: ws.id, actorUserId: operatorId, creatorId: creator.id });
    expect(history.outreachSends).toHaveLength(1);
    expect(history.outreachSends[0]?.id).toBe(send.id);
    expect(history.inboundMessages).toHaveLength(1);
    expect(history.inboundMessages[0]?.id).toBe(reply.id);

    // --- Human-triggered Whop Affiliate workflow (admin-only, against the real Mock Whop provider) ---
    const affiliate = await requestAffiliateCreation({ workspaceId: ws.id, actorUserId: ownerId, creatorId: creator.id, campaignId: campaign.id });
    expect(affiliate.status).toBe("pending");
    const affiliateResult = await executeAffiliateCreation({ workspaceId: ws.id, creatorAffiliateId: affiliate.id });
    expect(affiliateResult.status).toBe("active");

    // --- Conversion (real ingestion, deduped on provider event id) ---
    const { conversion, wasNew } = await ingestWhopConversion({
      workspaceId: ws.id,
      creatorAffiliateId: affiliate.id,
      provider: "mock",
      providerEventId: "e2ev1-conversion-1",
      eventType: "order",
      occurredAt: new Date(),
      amount: 79.0,
      currency: "USD",
    });
    expect(wasNew).toBe(true);
    expect(conversion.provenance).toBe("verified_external");
    const conversions = await listConversionsForAffiliate({ workspaceId: ws.id, actorUserId: operatorId, creatorAffiliateId: affiliate.id });
    expect(conversions).toHaveLength(1);

    // --- Analytics: the workspace-wide and per-campaign rollups reflect every real thing that just happened ---
    const workspaceAnalytics = await getWorkspaceAnalytics({ workspaceId: ws.id, actorUserId: operatorId });
    expect(workspaceAnalytics.products.withApprovedIntelligence).toBe(1);
    expect(workspaceAnalytics.qualification.passed).toBe(1);
    expect(workspaceAnalytics.matching.totalCurrentlyMatched).toBe(1);
    expect(workspaceAnalytics.outreach.byApprovalStatus.approved).toBe(1);
    expect(workspaceAnalytics.sends.byStatus.sent).toBe(1);
    expect(workspaceAnalytics.replies.total).toBe(1);
    expect(workspaceAnalytics.replies.byClassification.interested).toBe(1);
    expect(workspaceAnalytics.crm.byRelationshipStatus.in_conversation).toBe(1);
    expect(workspaceAnalytics.crm.totalNotes).toBe(1);
    expect(workspaceAnalytics.crm.openTasks).toBe(1);
    expect(workspaceAnalytics.whop.affiliates.byStatus.active).toBe(1);
    expect(workspaceAnalytics.whop.conversions.total).toBe(1);
    expect(workspaceAnalytics.whop.conversions.revenueByCurrency).toEqual([{ currency: "USD", total: 79 }]);

    const campaignAnalytics = await getCampaignAnalytics({ workspaceId: ws.id, actorUserId: operatorId, campaignId: campaign.id });
    expect(campaignAnalytics.sends.byStatus.sent).toBe(1);
    expect(campaignAnalytics.replies.total).toBe(1);
  });
});
