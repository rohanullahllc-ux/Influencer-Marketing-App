import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import {
  createProduct,
  createCampaign,
  updateCampaign,
  createManualCreator,
  shortlistCreator,
  qualifyCampaignCreators,
  persistCreatorMatch,
  persistOutreachDraft,
  createApprovalForDraft,
  decideApproval,
  scheduleSend,
  executeScheduledSend,
  ingestInboundMessage,
  updateCreatorRelationship,
  addCreatorNote,
  createCreatorTask,
  requestAffiliateCreation,
  executeAffiliateCreation,
  ingestWhopConversion,
  getWorkspaceAnalytics,
  getCampaignAnalytics,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { withWorkspace, schema } from "@rdv/db";
import { closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { AuthorizationError } from "@rdv/lib";
import { resetDb } from "./helpers.js";

/**
 * Wave 5 (Analytics): every number asserted here comes from real rows
 * created through the real domain functions in this test — nothing
 * mocked, nothing pre-computed. Exercises the full chain: product ->
 * discovery -> qualification -> matching -> campaign -> outreach ->
 * approval -> send -> reply -> CRM -> Whop affiliate/conversion, then
 * checks both the workspace-wide and campaign-scoped rollups agree with
 * what was actually created.
 */
describe("Analytics (Wave 5)", () => {
  let wsId: string;
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Analytics WS", ownerEmail: "analytics-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("analytics-owner@test.local")).id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  async function setSubscriberCount(creatorId: string, count: number) {
    await withWorkspace(wsId, (tx) => tx.update(schema.creators).set({ subscriberCount: count }).where(eq(schema.creators.id, creatorId)));
  }

  it("rolls up real counts across the whole build, workspace-wide and per-campaign", async () => {
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Analytics Product" });
    await withWorkspace(wsId, (tx) =>
      tx.insert(schema.productIntelligence).values({
        workspaceId: wsId,
        productId: product.id,
        origin: "ai_derived",
        idealCustomer: ["x"],
        status: "approved",
        approvedBy: ownerId,
        approvedAt: new Date(),
      })
    );

    const campaign = await createCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      input: { productId: product.id, name: "Analytics Campaign", qualificationThresholds: { minSubscribers: 1000 } },
    });
    await updateCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, input: { status: "active" } });

    const passingCreator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Big Cook", contactEmail: "big@example.com" });
    await setSubscriberCount(passingCreator.id, 5000);
    const failingCreator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Small Cook", contactEmail: "small@example.com" });
    await setSubscriberCount(failingCreator.id, 500);

    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: passingCreator.id });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: failingCreator.id });

    await qualifyCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id });
    await persistCreatorMatch({
      workspaceId: wsId,
      campaignId: campaign.id,
      creatorId: passingCreator.id,
      data: { score: 0.9, explanation: "Great fit", factors: ["niche match"], limitations: null },
    });

    const draft = await persistOutreachDraft({
      workspaceId: wsId,
      campaignId: campaign.id,
      creatorId: passingCreator.id,
      templateId: null,
      subject: "Hi Big Cook",
      body: "Body",
      generationInput: {},
    });
    const approval = await createApprovalForDraft({ workspaceId: wsId, actorUserId: ownerId, draftId: draft.id });
    await decideApproval({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id, decision: "approve" });

    const send = await scheduleSend({ workspaceId: wsId, actorUserId: ownerId, approvalId: approval.id });
    const sendResult = await executeScheduledSend({ workspaceId: wsId, outreachSendId: send.id });
    expect(sendResult.status).toBe("sent");

    await ingestInboundMessage({
      workspaceId: wsId,
      provider: "mock",
      providerMessageId: "analytics-reply-1",
      fromIdentity: "big@example.com",
      body: "Interested!",
      receivedAt: new Date(),
    });

    await updateCreatorRelationship({ workspaceId: wsId, actorUserId: ownerId, creatorId: passingCreator.id, status: "in_conversation" });
    await addCreatorNote({ workspaceId: wsId, actorUserId: ownerId, creatorId: passingCreator.id, body: "Good vibes." });
    await createCreatorTask({ workspaceId: wsId, actorUserId: ownerId, creatorId: passingCreator.id, title: "Follow up" });

    const affiliate = await requestAffiliateCreation({ workspaceId: wsId, actorUserId: ownerId, creatorId: passingCreator.id });
    await executeAffiliateCreation({ workspaceId: wsId, creatorAffiliateId: affiliate.id });
    await ingestWhopConversion({
      workspaceId: wsId,
      creatorAffiliateId: affiliate.id,
      provider: "mock",
      providerEventId: "conv-1",
      eventType: "order",
      occurredAt: new Date(),
      amount: 49.99,
      currency: "USD",
    });

    const summary = await getWorkspaceAnalytics({ workspaceId: wsId, actorUserId: ownerId });

    expect(summary.products.total).toBe(1);
    expect(summary.products.withApprovedIntelligence).toBe(1);

    expect(summary.discovery.totalCreators).toBe(2);
    expect(summary.discovery.byProvenance.human_entered).toBe(2);

    expect(summary.qualification.totalCurrentlyEvaluated).toBe(2);
    expect(summary.qualification.passed).toBe(1);
    expect(summary.qualification.failed).toBe(1);
    expect(summary.qualification.topFailureReasons.length).toBeGreaterThan(0);
    expect(summary.qualification.topFailureReasons[0]!.reason).toContain("subscriberCount");

    expect(summary.matching.totalCurrentlyMatched).toBe(1);
    expect(summary.matching.averageScore).toBeCloseTo(0.9, 5);
    expect(summary.matching.sampleSize).toBe(1);

    expect(summary.campaigns.total).toBe(1);
    expect(summary.campaigns.byStatus.active).toBe(1);
    expect(summary.campaigns.totalShortlistEntries).toBe(2);

    expect(summary.outreach.totalDrafts).toBe(1);
    expect(summary.outreach.byApprovalStatus.approved).toBe(1);

    expect(summary.sends.total).toBe(1);
    expect(summary.sends.byStatus.sent).toBe(1);

    expect(summary.replies.total).toBe(1);
    // A known creator with no prior send at ingest ordering could be ambiguous or matched -- either way it's counted exactly once.
    expect(Object.values(summary.replies.byMatchStatus).reduce((a, b) => a + b, 0)).toBe(1);

    expect(summary.crm.byRelationshipStatus.in_conversation).toBe(1);
    expect(summary.crm.openTasks).toBe(1);
    expect(summary.crm.totalTasks).toBe(1);
    expect(summary.crm.totalNotes).toBe(1);

    expect(summary.whop.affiliates.total).toBe(1);
    expect(summary.whop.affiliates.byStatus.active).toBe(1);
    expect(summary.whop.conversions.total).toBe(1);
    expect(summary.whop.conversions.revenueByCurrency).toEqual([{ currency: "USD", total: 49.99 }]);

    const campaignSummary = await getCampaignAnalytics({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id });
    expect(campaignSummary.shortlist.total).toBe(2);
    expect(campaignSummary.qualification.passed).toBe(1);
    expect(campaignSummary.qualification.failed).toBe(1);
    expect(campaignSummary.matching.totalCurrentlyMatched).toBe(1);
    expect(campaignSummary.outreach.totalDrafts).toBe(1);
    expect(campaignSummary.sends.byStatus.sent).toBe(1);
  });

  it("returns honest zeroes for an empty workspace rather than fabricating placeholder data", async () => {
    const summary = await getWorkspaceAnalytics({ workspaceId: wsId, actorUserId: ownerId });
    expect(summary.products.total).toBe(0);
    expect(summary.discovery.totalCreators).toBe(0);
    expect(summary.matching.averageScore).toBeNull();
    expect(summary.whop.conversions.revenueByCurrency).toEqual([]);
  });

  it("RBAC applies: an unauthenticated/unknown actor is rejected", async () => {
    await expect(
      getWorkspaceAnalytics({ workspaceId: wsId, actorUserId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(AuthorizationError);
  });
});
