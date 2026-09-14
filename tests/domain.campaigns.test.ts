import { describe, it, expect, beforeEach } from "vitest";
import {
  createProduct,
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  shortlistCreator,
  updateCampaignCreatorStatus,
  listCampaignCreators,
  createManualCreator,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 4 (plan §9): Campaign CRUD, every §14.5 field, and the shortlist. */
describe("Campaign CRUD", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Campaign WS", ownerEmail: "campaign-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("campaign-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
  });

  it("creates a campaign with every §14.5 field settable", async () => {
    const campaign = await createCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      input: {
        productId,
        name: "Spring Launch",
        objective: "Drive trial signups",
        targetGeography: ["US", "CA"],
        targetLanguages: ["en"],
        creatorTypes: ["lifestyle"],
        qualificationThresholds: { minSubscribers: 10000 },
        nicheRequirements: ["cooking"],
        startDate: "2026-03-01",
        endDate: "2026-04-01",
        outreachStrategy: "Cold email, single follow-up",
        sendingLimits: { dailyCap: 20 },
        firstSendCap: 5,
        followUpRules: { waitDays: 3, maxFollowUps: 1 },
        sendingWindow: { startHour: 9, endHour: 17 },
      },
    });

    expect(campaign.name).toBe("Spring Launch");
    expect(campaign.status).toBe("draft");
    expect(campaign.productId).toBe(productId);
    expect(campaign.targetGeography).toEqual(["US", "CA"]);
    expect(campaign.firstSendCap).toBe(5);
    expect(campaign.qualificationThresholds).toEqual({ minSubscribers: 10000 });
    expect(campaign.followUpRules).toEqual({ waitDays: 3, maxFollowUps: 1 });
  });

  it("rejects an empty name and a negative firstSendCap", async () => {
    await expect(
      createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "  " } })
    ).rejects.toThrow(/name is required/);

    await expect(
      createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "X", firstSendCap: -1 } })
    ).rejects.toThrow(/firstSendCap must be/);
  });

  it("rejects a campaign against a nonexistent product", async () => {
    await expect(
      createCampaign({
        workspaceId: wsId,
        actorUserId: ownerId,
        input: { productId: "00000000-0000-0000-0000-000000000000", name: "X" },
      })
    ).rejects.toThrow(/No product/);
  });

  it("lists only the current workspace's campaigns", async () => {
    await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "A" } });
    await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "B" } });

    const otherWs = await createWorkspaceWithOwner({ workspaceName: "Other Campaign WS", ownerEmail: "campaign-other@test.local" });
    const otherOwnerId = (await getUserByEmail("campaign-other@test.local")).id;
    const otherProduct = await createProduct({ workspaceId: otherWs.id, actorUserId: otherOwnerId, name: "Other Product" });
    await createCampaign({ workspaceId: otherWs.id, actorUserId: otherOwnerId, input: { productId: otherProduct.id, name: "Not visible" } });

    const campaigns = await listCampaigns({ workspaceId: wsId, actorUserId: ownerId });
    expect(campaigns).toHaveLength(2);
    expect(campaigns.every((c) => c.workspaceId === wsId)).toBe(true);
  });

  it("gets a campaign and throws NotFoundError for an unknown id", async () => {
    const created = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Findable" } });
    const found = await getCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: created.id });
    expect(found.id).toBe(created.id);

    await expect(
      getCampaign({ workspaceId: wsId, actorUserId: ownerId, campaignId: "00000000-0000-0000-0000-000000000000" })
    ).rejects.toThrow(/No campaign/);
  });

  it("updates campaign fields and status", async () => {
    const created = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Old" } });
    const updated = await updateCampaign({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId: created.id,
      input: { name: "New", status: "active", firstSendCap: 10 },
    });
    expect(updated.name).toBe("New");
    expect(updated.status).toBe("active");
    expect(updated.firstSendCap).toBe(10);
  });

  it("rejects an actor with no membership in the workspace", async () => {
    await createWorkspaceWithOwner({ workspaceName: "Campaign Outsider WS", ownerEmail: "campaign-outsider@test.local" });
    const outsiderId = (await getUserByEmail("campaign-outsider@test.local")).id;

    await expect(
      createCampaign({ workspaceId: wsId, actorUserId: outsiderId, input: { productId, name: "Should fail" } })
    ).rejects.toThrow();
  });

  it("shortlists a creator idempotently and updates shortlist status", async () => {
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Shortlist Test" } });
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Jane" });

    const first = await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    expect(first.status).toBe("shortlisted");

    // Re-shortlisting the same creator must not duplicate (pk is campaign_id+creator_id).
    const second = await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id, creatorId: creator.id });
    expect(second.campaignId).toBe(first.campaignId);
    expect(second.creatorId).toBe(first.creatorId);

    const list = await listCampaignCreators({ workspaceId: wsId, actorUserId: ownerId, campaignId: campaign.id });
    expect(list).toHaveLength(1);

    const updated = await updateCampaignCreatorStatus({
      workspaceId: wsId,
      actorUserId: ownerId,
      campaignId: campaign.id,
      creatorId: creator.id,
      status: "selected",
    });
    expect(updated.status).toBe("selected");
  });

  it("rejects shortlisting a nonexistent creator", async () => {
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "X" } });
    await expect(
      shortlistCreator({
        workspaceId: wsId,
        actorUserId: ownerId,
        campaignId: campaign.id,
        creatorId: "00000000-0000-0000-0000-000000000000",
      })
    ).rejects.toThrow(/No creator/);
  });
});
