import { and, desc, eq, inArray } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { Creator } from "./entities.js";

const { creators, products, productIntelligence, workspaceMembers } = schema;

// Narrow, configurable search only (plan §8 risks: no bulk-scrape
// fallback — a hard cap keeps a single run from exhausting quota).
const MAX_DISCOVERY_RESULTS = 25;

/**
 * Wave 2 Phase 3 (plan §8): enqueues async YouTube discovery — never runs
 * on the request thread, mirroring Phase 2's requestProductIntelligenceGeneration.
 * Rejects a product with no approved Product Intelligence (plan §8 test:
 * "discovery without approved intelligence is rejected").
 */
export async function requestCreatorDiscovery(params: {
  workspaceId: string;
  actorUserId: string;
  productId: string;
  query: string;
  maxResults?: number;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, productId, query } = params;
  const maxResults = params.maxResults ?? 10;

  if (!query || query.trim().length === 0) {
    throw new ValidationError("query is required to run creator discovery");
  }
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_DISCOVERY_RESULTS) {
    throw new ValidationError(`maxResults must be an integer between 1 and ${MAX_DISCOVERY_RESULTS}`);
  }

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");

    const [product] = await tx.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) throw new NotFoundError(`No product with id ${productId}`);

    const [approved] = await tx
      .select()
      .from(productIntelligence)
      .where(and(eq(productIntelligence.productId, productId), eq(productIntelligence.status, "approved")))
      .limit(1);
    if (!approved) {
      throw new ValidationError(
        "This product has no approved Product Intelligence yet — approve a version before running creator discovery."
      );
    }
  });

  const job = await getQueue(QUEUE_LANES.creatorDiscovery).add("youtube_discovery_search", {
    workspaceId,
    actorUserId,
    productId,
    query: query.trim(),
    maxResults,
  });
  if (!job.id) throw new Error("youtube_discovery_search job was enqueued without an id");
  return { jobId: job.id };
}

export interface DiscoveredChannel {
  channelId: string;
  title: string;
  description: string;
  country: string | null;
  subscriberCount: number | null;
}

/**
 * Called only by the worker's `youtube_discovery_search` job processor.
 * Upserts on the Phase 1 unique index (workspace_id, platform,
 * platform_channel_id) — re-running discovery with the same inputs
 * updates the existing row's stats rather than creating a duplicate
 * (plan §8 test). Always tagged `source: youtube_api`,
 * `provenance: verified_external` — this is real API data, never guessed.
 */
export async function upsertDiscoveredCreators(params: {
  workspaceId: string;
  channels: DiscoveredChannel[];
}): Promise<Creator[]> {
  const { workspaceId, channels } = params;
  if (channels.length === 0) return [];

  return withWorkspace(workspaceId, async (tx) => {
    const results: Creator[] = [];
    for (const ch of channels) {
      const channelUrl = `https://www.youtube.com/channel/${ch.channelId}`;
      const row = oneOrThrow(
        await tx
          .insert(creators)
          .values({
            workspaceId,
            platform: "youtube",
            platformChannelId: ch.channelId,
            displayName: ch.title || null,
            channelUrl,
            subscriberCount: ch.subscriberCount,
            country: ch.country,
            status: "active",
            source: "youtube_api",
            provenance: "verified_external",
          })
          .onConflictDoUpdate({
            target: [creators.workspaceId, creators.platform, creators.platformChannelId],
            set: {
              displayName: ch.title || null,
              channelUrl,
              subscriberCount: ch.subscriberCount,
              country: ch.country,
              lastEnrichedAt: new Date(),
            },
          })
          .returning(),
        "upsert discovered creator"
      );
      results.push(row);
    }
    return results;
  });
}

export interface DiscoveryRunStatus {
  id: string;
  state: string;
  creators: Creator[] | null;
  failedReason: string | null;
}

/** Poll endpoint backing (plan §8: `GET /api/products/:id/discovery/:runId`). No separate "runs" table — the BullMQ job itself, addressed by its id, is the run record, mirroring Phase 2's job-based flow. */
export async function getCreatorDiscoveryRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<DiscoveryRunStatus> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.creatorDiscovery).getJob(runId);
  if (!job) throw new NotFoundError(`No discovery run with id ${runId}`);

  const state = await job.getState();

  if (state === "completed") {
    const returnValue = job.returnvalue as { creatorIds: string[] } | undefined;
    const creatorIds = returnValue?.creatorIds ?? [];
    const rows =
      creatorIds.length > 0
        ? await withWorkspace(workspaceId, (tx) => tx.select().from(creators).where(inArray(creators.id, creatorIds)))
        : [];
    return { id: job.id!, state, creators: rows, failedReason: null };
  }

  if (state === "failed") {
    return { id: job.id!, state, creators: null, failedReason: job.failedReason ?? "Unknown error" };
  }

  return { id: job.id!, state, creators: null, failedReason: null };
}

export async function createManualCreator(params: {
  workspaceId: string;
  actorUserId: string;
  displayName: string;
  channelUrl?: string | null;
  niche?: string | null;
  country?: string | null;
  contactEmail?: string | null;
}): Promise<Creator> {
  const { workspaceId, actorUserId, displayName, channelUrl, niche, country, contactEmail } = params;
  if (!displayName || displayName.trim().length === 0) {
    throw new ValidationError("displayName is required");
  }

  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");

    const row = oneOrThrow(
      await tx
        .insert(creators)
        .values({
          workspaceId,
          platform: "manual",
          displayName: displayName.trim(),
          channelUrl: channelUrl ?? null,
          niche: niche ?? null,
          country: country ?? null,
          contactEmail: contactEmail ?? null,
          status: "active",
          source: "manual",
          provenance: "human_entered",
        })
        .returning(),
      "insert manual creator"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator.manually_added",
      entityType: "creator",
      entityId: row.id,
      metadata: { displayName: row.displayName },
    });

    return row;
  });
}

export async function listCreators(params: { workspaceId: string; actorUserId: string }): Promise<Creator[]> {
  const { workspaceId, actorUserId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");
    return tx.select().from(creators).where(eq(creators.workspaceId, workspaceId)).orderBy(desc(creators.discoveredAt));
  });
}

/** Wave 2 Phase 5: a single-creator lookup, added for the qualification/matching workers so they never reach into @rdv/db's schema directly. */
export async function getCreator(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
}): Promise<Creator> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
    requireRole(actorMembership?.role, "member_operator");
    const [creator] = await tx.select().from(creators).where(eq(creators.id, creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${creatorId}`);
    return creator;
  });
}
