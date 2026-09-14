import { describe, it, expect, beforeEach, afterAll } from "vitest";
import {
  createProduct,
  createCampaign,
  createManualCreator,
  shortlistCreator,
  requestCreatorMatching,
  persistCreatorMatch,
  getCreatorMatchingRunStatus,
  listCurrentMatches,
} from "@rdv/domain";
import { createWorkspaceWithOwner, getUserByEmail } from "@rdv/auth";
import { QUEUE_LANES, getQueue, closeAllQueues, closeRedisConnection } from "@rdv/queue";
import { resetDb } from "./helpers.js";

/** Wave 2 Phase 5 (plan §10): AI creator-match request/poll/persist — append-only, run against real local Postgres + Redis. */
describe("Creator Matching", () => {
  let wsId: string;
  let ownerId: string;
  let productId: string;
  let campaignId: string;

  beforeEach(async () => {
    await resetDb();
    const ws = await createWorkspaceWithOwner({ workspaceName: "Match WS", ownerEmail: "match-owner@test.local" });
    wsId = ws.id;
    ownerId = (await getUserByEmail("match-owner@test.local")).id;
    const product = await createProduct({ workspaceId: wsId, actorUserId: ownerId, name: "Meal Kit Co" });
    productId = product.id;
    const campaign = await createCampaign({ workspaceId: wsId, actorUserId: ownerId, input: { productId, name: "Spring" } });
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await closeAllQueues();
    await closeRedisConnection();
  });

  it("rejects a matching request for a campaign with an empty shortlist", async () => {
    await expect(requestCreatorMatching({ workspaceId: wsId, actorUserId: ownerId, campaignId })).rejects.toThrow(
      /no shortlisted creators/
    );
  });

  it("enqueues a real ai_explain_match job once the shortlist is non-empty", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook" });
    await shortlistCreator({ workspaceId: wsId, actorUserId: ownerId, campaignId, creatorId: creator.id });

    const { jobId } = await requestCreatorMatching({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    const job = await getQueue(QUEUE_LANES.aiOps).getJob(jobId);
    expect(job).toBeDefined();
    expect(job?.name).toBe("ai_explain_match");
    expect(job?.data).toMatchObject({ workspaceId: wsId, campaignId });

    const status = await getCreatorMatchingRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: jobId });
    expect(status.state).toBe("waiting");

    await job?.remove();
  });

  it("throws NotFoundError for an unknown matching run id", async () => {
    await expect(
      getCreatorMatchingRunStatus({ workspaceId: wsId, actorUserId: ownerId, runId: "does-not-exist" })
    ).rejects.toThrow(/No matching run/);
  });

  it("persists an append-only match, and listCurrentMatches resolves the newest row per creator", async () => {
    const creator = await createManualCreator({ workspaceId: wsId, actorUserId: ownerId, displayName: "Cook" });

    const first = await persistCreatorMatch({
      workspaceId: wsId,
      campaignId,
      creatorId: creator.id,
      data: { score: 0.5, explanation: "First pass", factors: ["niche fit"], limitations: null },
    });
    expect(first.score).toBe("0.5");
    expect(first.explanation).toBe("First pass");

    const second = await persistCreatorMatch({
      workspaceId: wsId,
      campaignId,
      creatorId: creator.id,
      data: { score: 0.8, explanation: "Re-run with more context", factors: ["niche fit", "audience size"], limitations: "small sample" },
    });

    const current = await listCurrentMatches({ workspaceId: wsId, actorUserId: ownerId, campaignId });
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(second.id);
    expect(current[0]?.score).toBe("0.8");

    // The first evaluation is never deleted — it's a distinct row, still
    // reachable by anyone querying the append-only creator_matches table
    // directly (a full history endpoint isn't part of this phase's scope).
    expect(first.id).not.toBe(second.id);
  });
});
