import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  createCampaign,
  createManualCreator,
  shortlistCreator,
  qualifyCampaignCreators,
  listCurrentQualifications,
  listQualificationHistory,
  evaluateQualification,
  type QualificationThresholds,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/**
 * Wave 2 Phase 5 (plan §10): deterministic qualification — the pure
 * evaluator function directly, plus the full DB-integrated flow. This is
 * the one boundary the plan is explicit and non-negotiable about: pure,
 * deterministic, no AI dependency — proven here by never importing @rdv/ai.
 */
describe("Qualification — pure evaluator", () => {
  it("passes a creator meeting every threshold and niche requirement", () => {
    const thresholds: QualificationThresholds = { minSubscribers: 1000, minAvgViews: 500 };
    const creator = {
      subscriberCount: 5000,
      avgViews: 1000,
      engagementRate: null,
      niche: "cooking",
      subNiche: "meal kits",
    } as Parameters<typeof evaluateQualification>[2];

    const result = evaluateQualification(thresholds, ["cooking"], creator);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails a creator below minSubscribers, with a specific reason", () => {
    const thresholds: QualificationThresholds = { minSubscribers: 10000 };
    const creator = { subscriberCount: 500, avgViews: null, engagementRate: null, niche: null, subNiche: null } as Parameters<
      typeof evaluateQualification
    >[2];

    const result = evaluateQualification(thresholds, null, creator);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/subscriberCount 500 is below minSubscribers 10000/);
  });

  it("fails a threshold check when the measured value is null (never guesses)", () => {
    const thresholds: QualificationThresholds = { minEngagementRate: 2 };
    const creator = { subscriberCount: 5000, avgViews: 1000, engagementRate: null, niche: null, subNiche: null } as Parameters<
      typeof evaluateQualification
    >[2];

    const result = evaluateQualification(thresholds, null, creator);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/engagementRate unknown is below minEngagementRate 2/);
  });

  it("fails when niche requirements exist but the creator matches none", () => {
    const creator = { subscriberCount: 5000, avgViews: 1000, engagementRate: null, niche: "gaming", subNiche: null } as Parameters<
      typeof evaluateQualification
    >[2];
    const result = evaluateQualification({}, ["cooking", "fitness"], creator);
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toMatch(/niche\/subNiche does not match/);
  });

  it("is deterministic: identical inputs always produce identical results", () => {
    const thresholds: QualificationThresholds = { minSubscribers: 1000 };
    const creator = { subscriberCount: 999, avgViews: null, engagementRate: null, niche: null, subNiche: null } as Parameters<
      typeof evaluateQualification
    >[2];

    const results = Array.from({ length: 5 }, () => evaluateQualification(thresholds, null, creator));
    expect(new Set(results.map((r) => r.passed)).size).toBe(1);
    expect(new Set(results.map((r) => JSON.stringify(r.reasons))).size).toBe(1);
  });
});

describe("Qualification — DB-integrated", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Qual WS", ownerEmail: "qual-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("qual-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
    const campaign = await createCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      input: { productId, name: "Spring", qualificationThresholds: { minSubscribers: 1000 }, nicheRequirements: ["cooking"] },
    });
    campaignId = campaign.id;
  });

  it("rejects qualifying a campaign with an empty shortlist", async () => {
    await expect(qualifyCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId })).rejects.toThrow(
      /no shortlisted creators/
    );
  });

  it("evaluates every shortlisted creator and persists an append-only row per creator", async () => {
    const creatorPass = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Big Cook", niche: "cooking" });
    const creatorFail = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Small Gamer", niche: "gaming" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creatorPass.id });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creatorFail.id });

    const results = await qualifyCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(results).toHaveLength(2);

    const current = await listCurrentQualifications({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    const byCreator = new Map(current.map((r) => [r.creatorId, r]));
    // Neither creator has a subscriberCount set (manual entry) — both fail
    // the minSubscribers threshold; niche only distinguishes the reason.
    expect(byCreator.get(creatorPass.id)?.passed).toBe(false);
    expect(byCreator.get(creatorFail.id)?.passed).toBe(false);
    expect(byCreator.get(creatorFail.id)?.thresholdsSnapshot).toMatchObject({ thresholds: { minSubscribers: 1000 } });
  });

  it("re-evaluating after a threshold change appends a new row rather than overwriting the old one", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook", niche: "cooking" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });

    await qualifyCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId });

    const history1 = await listQualificationHistory({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    expect(history1).toHaveLength(1);

    // Re-run without changing anything — still appends, never updates in place.
    await qualifyCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId });

    const history2 = await listQualificationHistory({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });
    expect(history2).toHaveLength(2);

    const current = await listCurrentQualifications({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(history2[0]?.id); // newest row resolves as "current"
  });
});
