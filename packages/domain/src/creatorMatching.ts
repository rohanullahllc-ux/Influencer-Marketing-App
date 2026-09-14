import { and, desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { CreatorMatch } from "./entities.js";

const { campaigns, campaignCreators, creatorMatches, workspaceMembers } = schema;

/**
 * Wave 2 Phase 5 (plan §10): AI-assisted, explainable creator matching —
 * always a second signal alongside deterministic qualification, never a
 * replacement for it (packages/domain/src/qualification.ts has no
 * dependency on this file or on @rdv/ai, and this file never writes to
 * creator_qualifications). Async via ai-ops, mirroring Phase 2/3's
 * job-based flow exactly — no separate "runs" table, the BullMQ job
 * itself is the run record.
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function requestCreatorMatching(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, campaignId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const shortlist = await tx.select().from(campaignCreators).where(eq(campaignCreators.campaignId, campaignId));
    if (shortlist.length === 0) {
      throw new ValidationError("This campaign has no shortlisted creators to match");
    }
  });

  const job = await getQueue(QUEUE_LANES.aiOps).add("ai_explain_match", { workspaceId, actorUserId, campaignId });
  if (!job.id) throw new Error("ai_explain_match job was enqueued without an id");
  return { jobId: job.id };
}

/** Called only by the worker's `ai_explain_match` job processor — always inserts a new row (append-only, plan §14.4). */
export async function persistCreatorMatch(params: {
  workspaceId: string;
  campaignId: string;
  creatorId: string;
  data: { score: number; explanation: string; factors: string[]; limitations: string | null };
}): Promise<CreatorMatch> {
  const { workspaceId, campaignId, creatorId, data } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const row = oneOrThrow(
      await tx
        .insert(creatorMatches)
        .values({
          workspaceId,
          campaignId,
          creatorId,
          score: String(data.score),
          explanation: data.explanation,
          factors: data.factors,
          limitations: data.limitations,
        })
        .returning(),
      "insert creator_match"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId: null,
      action: "campaign.creator_matched",
      entityType: "creator_match",
      entityId: row.id,
      metadata: { campaignId, creatorId },
    });

    return row;
  });
}

/** Poll endpoint backing for a matching run — mirrors getCreatorDiscoveryRunStatus. */
export async function getCreatorMatchingRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<{ id: string; state: string; count: number | null; failedReason: string | null }> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.aiOps).getJob(runId);
  if (!job) throw new NotFoundError(`No matching run with id ${runId}`);

  const state = await job.getState();

  if (state === "completed") {
    const returnValue = job.returnvalue as { count: number } | undefined;
    return { id: job.id!, state, count: returnValue?.count ?? 0, failedReason: null };
  }
  if (state === "failed") {
    return { id: job.id!, state, count: null, failedReason: job.failedReason ?? "Unknown error" };
  }
  return { id: job.id!, state, count: null, failedReason: null };
}

/** Latest match per creator for this campaign (append-only log — "current" is the newest row). A score is never returned without its explanation (plan §10 test). */
export async function listCurrentMatches(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CreatorMatch[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const all = await tx
      .select()
      .from(creatorMatches)
      .where(and(eq(creatorMatches.workspaceId, workspaceId), eq(creatorMatches.campaignId, campaignId)))
      .orderBy(desc(creatorMatches.computedAt));

    const latestByCreator = new Map<string, CreatorMatch>();
    for (const row of all) {
      if (!latestByCreator.has(row.creatorId)) latestByCreator.set(row.creatorId, row);
    }
    return [...latestByCreator.values()];
  });
}
