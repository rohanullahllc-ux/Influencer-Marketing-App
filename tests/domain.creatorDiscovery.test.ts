import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  persistGeneratedIntelligence,
  approveProductIntelligence,
  requestCreatorDiscovery,
  upsertDiscoveredCreators,
  getCreatorDiscoveryRunStatus,
  createManualCreator,
  listCreators,
  type GeneratedIntelligenceData,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";
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
 * Wave 2 Phase 3 (plan §8): creator discovery request/upsert/poll, and
 * manual creator entry — run against real local Postgres + Redis.
 */
describe("Creator Discovery", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Discovery WS", ownerEmail: "discovery-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("discovery-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("rejects discovery when the product has no approved Product Intelligence", async () => {
    await expect(
      requestCreatorDiscovery({ workspaceId: wsId, actorUserId: ownerId, productId, query: "meal kits" })
    ).rejects.toThrow(/no approved Product Intelligence/);
  });

  it("rejects an empty query and an out-of-range maxResults", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE_INTELLIGENCE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draft.id });

    await expect(
      requestCreatorDiscovery({ workspaceId: wsId, actorUserId: ownerId, productId, query: "  " })
    ).rejects.toThrow(/query is required/);

    await expect(
      requestCreatorDiscovery({ workspaceId: wsId, actorUserId: ownerId, productId, query: "meal kits", maxResults: 100 })
    ).rejects.toThrow(/maxResults must be/);
  });

  it("enqueues a real youtube_discovery_search job once intelligence is approved", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE_INTELLIGENCE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draft.id });

    const { jobId } = await requestCreatorDiscovery({
      workspaceId: wsId,
      actorUserId: ownerId,
      productId,
      query: "meal kit recipes",
      maxResults: 5,
    });

    const job = await getQueue(QUEUE_LANES.creatorDiscovery).getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.name).toBe("youtube_discovery_search");
    expect(job?.data).toMatchObject({ workspaceId: wsId, productId, query: "meal kit recipes", maxResults: 5 });

    await job?.remove();
  });

  it("a not-yet-run run id reports state waiting via the poll helper", async () => {
    const draft = await persistGeneratedIntelligence({ workspaceId: wsId, productId, data: SAMPLE_INTELLIGENCE });
    await approveProductIntelligence({ workspaceId: wsId, actorUserId: ownerId, intelligenceId: draft.id });

    const { jobId } = await requestCreatorDiscovery({
      workspaceId: wsId,
      actorUserId: ownerId,
      productId,
      query: "meal kit recipes",
    });

    const status = await getCreatorDiscoveryRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: jobId });
    expect(status.state).toBe("waiting");
    expect(status.creators).toBeNull();
    expect(status.failedReason).toBeNull();

    const job = await getQueue(QUEUE_LANES.creatorDiscovery).getJob(jobId);
    await job?.remove();
  });

  it("throws NotFoundError for an unknown run id", async () => {
    await expect(
      getCreatorDiscoveryRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: "does-not-exist" })
    ).rejects.toThrow(/No discovery run/);
  });

  it("upserts discovered channels without duplicating on re-run, and refreshes stats", async () => {
    const first = await upsertDiscoveredCreators({
      workspaceId: wsId,
      channels: [
        { channelId: "UC_test_channel_1", title: "Meal Kit Reviews", description: "d", country: "US", subscriberCount: 1000 },
      ],
    });
    expect(first).toHaveLength(1);
    expect(first[0]?.provenance).toBe("verified_external");
    expect(first[0]?.source).toBe("youtube_api");
    expect(first[0]?.subscriberCount).toBe(1000);

    // Re-running discovery with the same channel must update, not duplicate.
    const second = await upsertDiscoveredCreators({
      workspaceId: wsId,
      channels: [
        { channelId: "UC_test_channel_1", title: "Meal Kit Reviews", description: "d", country: "US", subscriberCount: 1500 },
      ],
    });
    expect(second).toHaveLength(1);
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(second[0]?.subscriberCount).toBe(1500);

    const all = await listCreators({ workspaceId: wsId, actorUserId: ownerId });
    expect(all.filter((c) => c.platformChannelId === "UC_test_channel_1")).toHaveLength(1);
  });

  it("creates a manual creator tagged human_entered/manual, independent of any discovery run", async () => {
    const creator = await createManualCreator({
      workspaceId: wsId,
      actorUserId: ownerId,
      displayName: "Jane's Kitchen",
      channelUrl: "https://example.com/jane",
      niche: "cooking",
      country: "US",
    });
    expect(creator.provenance).toBe("human_entered");
    expect(creator.source).toBe("manual");
    expect(creator.platform).toBe("manual");
    expect(creator.displayName).toBe("Jane's Kitchen");
  });

  it("rejects an empty displayName for a manual creator", async () => {
    await expect(
      createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "   " })
    ).rejects.toThrow(/displayName is required/);
  });

  it("lists only the current workspace's creators", async () => {
    await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "A" });
    await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "B" });

    const otherWs = await createWorkspaceWithOwner({ workspaceName: "Other Discovery WS", ownerEmail: "discovery-other@test.local" });
    const otherOwnerId = (await getUserByEmail("discovery-other@test.local")).id;
    await createManualCreator({ workspaceId: otherWs.id, actorUserId: otherOwnerId, displayName: "Not visible" });

    const creators = await listCreators({ workspaceId: wsId, actorUserId: ownerId });
    expect(creators).toHaveLength(2);
    expect(creators.every((c) => c.workspaceId === wsId)).toBe(true);
  });
});
