import { and, desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError } from "@rdv/lib";
import type { InboundMessage } from "./entities.js";

const { creators, outreachSends, inboundMessages, workspaceMembers } = schema;

/**
 * Wave 3 (Reply Intelligence, product vision §"Reply intelligence"):
 * inbound replies are persisted verbatim, matched to a creator/campaign/
 * outreach where possible, classified into exactly Interested / Not
 * Interested / Needs Human Review, and may get an AI-suggested response —
 * which is never sent directly. It becomes an ordinary `outreach_drafts`
 * row (see outreachDrafts.ts's `persistOutreachDraft`) that must go
 * through the exact same edit/approve/safety-gate/send pipeline as any
 * other outreach message, rather than a parallel reply-send path.
 *
 * The actual AI calls live in the worker processor
 * (apps/worker/src/processors/replyIntelligence.ts), not here — same
 * layering as Phase 5/6's creatorMatching.ts/outreachDraft.ts processors:
 * @rdv/domain provides read/write primitives, the worker orchestrates the
 * AI call between them. This keeps every domain-level test in this file
 * fully deterministic (no AI/network involved).
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

/** Real email headers sometimes wrap the address as `Name <addr@example.com>` — extract the bare address either way. */
export function normalizeFromIdentity(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  const address = angleMatch ? angleMatch[1] : raw;
  return (address ?? raw).trim().toLowerCase();
}

interface MatchResult {
  matchStatus: "matched" | "ambiguous" | "unknown";
  creatorId: string | null;
  campaignId: string | null;
  outreachSendId: string | null;
}

async function matchInboundMessage(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  params: { workspaceId: string; fromIdentity: string }
): Promise<MatchResult> {
  const normalized = normalizeFromIdentity(params.fromIdentity);

  const matchingCreators = await tx
    .select({ id: creators.id })
    .from(creators)
    .where(and(eq(creators.workspaceId, params.workspaceId), eq(creators.contactEmail, normalized)));

  if (matchingCreators.length === 0) {
    return { matchStatus: "unknown", creatorId: null, campaignId: null, outreachSendId: null };
  }
  if (matchingCreators.length > 1) {
    // Multiple creator records share this contact email — genuinely
    // ambiguous which relationship this reply belongs to.
    return { matchStatus: "ambiguous", creatorId: null, campaignId: null, outreachSendId: null };
  }

  const creatorId = matchingCreators[0]!.id;
  const [mostRecentSend] = await tx
    .select()
    .from(outreachSends)
    .where(and(eq(outreachSends.creatorId, creatorId), eq(outreachSends.status, "sent")))
    .orderBy(desc(outreachSends.sentAt))
    .limit(1);

  if (!mostRecentSend) {
    // We know who this is, but not which campaign/outreach they're
    // replying to — needs a human to confirm/link rather than guessing.
    return { matchStatus: "ambiguous", creatorId, campaignId: null, outreachSendId: null };
  }

  return { matchStatus: "matched", creatorId, campaignId: mostRecentSend.campaignId, outreachSendId: mostRecentSend.id };
}

/**
 * Called by the webhook-ingest / reconciliation-polling worker jobs
 * (system-initiated, no live actor). Deduped on
 * (workspace_id, provider, provider_message_id) — a duplicate/replayed
 * delivery of an already-seen message is a true no-op: it returns the
 * existing row untouched and never re-matches or re-classifies.
 */
export async function ingestInboundMessage(params: {
  workspaceId: string;
  provider: string;
  providerMessageId: string;
  providerThreadId?: string | null;
  fromIdentity: string;
  toIdentity?: string | null;
  subject?: string | null;
  body: string;
  receivedAt: Date;
  rawPayload?: unknown;
}): Promise<{ message: InboundMessage; wasNew: boolean }> {
  const { workspaceId, provider, providerMessageId } = params;
  if (!params.body || params.body.trim().length === 0) {
    throw new ValidationError("body is required to ingest an inbound message");
  }
  if (!params.fromIdentity || params.fromIdentity.trim().length === 0) {
    throw new ValidationError("fromIdentity is required to ingest an inbound message");
  }

  return withWorkspace(workspaceId, async (tx) => {
    const match = await matchInboundMessage(tx, { workspaceId, fromIdentity: params.fromIdentity });

    const inserted = await tx
      .insert(inboundMessages)
      .values({
        workspaceId,
        provider,
        providerMessageId,
        providerThreadId: params.providerThreadId ?? null,
        fromIdentity: params.fromIdentity,
        toIdentity: params.toIdentity ?? null,
        subject: params.subject ?? null,
        body: params.body,
        receivedAt: params.receivedAt,
        rawPayload: (params.rawPayload as Record<string, unknown> | undefined) ?? null,
        matchStatus: match.matchStatus,
        creatorId: match.creatorId,
        campaignId: match.campaignId,
        outreachSendId: match.outreachSendId,
      })
      .onConflictDoNothing({ target: [inboundMessages.workspaceId, inboundMessages.provider, inboundMessages.providerMessageId] })
      .returning();

    if (inserted[0]) {
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: null,
        action: "reply.ingested",
        entityType: "inbound_message",
        entityId: inserted[0].id,
        metadata: { matchStatus: match.matchStatus, provider, providerMessageId },
      });
      return { message: inserted[0], wasNew: true };
    }

    // Duplicate delivery — return the existing row, unchanged.
    const [existing] = await tx
      .select()
      .from(inboundMessages)
      .where(
        and(
          eq(inboundMessages.workspaceId, workspaceId),
          eq(inboundMessages.provider, provider),
          eq(inboundMessages.providerMessageId, providerMessageId)
        )
      )
      .limit(1);
    if (!existing) throw new Error("inbound message insert conflicted but no existing row was found — data race");
    return { message: existing, wasNew: false };
  });
}

export async function requestReplyIntelligence(params: {
  workspaceId: string;
  actorUserId: string;
  inboundMessageId: string;
}): Promise<{ jobId: string }> {
  const { workspaceId, actorUserId, inboundMessageId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [message] = await tx.select().from(inboundMessages).where(eq(inboundMessages.id, inboundMessageId)).limit(1);
    if (!message) throw new NotFoundError(`No inbound message with id ${inboundMessageId}`);
  });

  const job = await getQueue(QUEUE_LANES.aiOps).add("reply_classify_and_suggest", { workspaceId, actorUserId, inboundMessageId });
  if (!job.id) throw new Error("reply_classify_and_suggest job was enqueued without an id");
  return { jobId: job.id };
}

/**
 * Called only by the worker's `reply_classify_and_suggest` job processor,
 * after it has already called the AI operations itself (same layering as
 * Phase 5's `persistCreatorMatch`). Always overwrites the current
 * classification fields — unlike qualification/matching, a fixed reply
 * message needs exactly one current classification, not an append-only
 * history of re-evaluations.
 */
export async function persistReplyClassification(params: {
  workspaceId: string;
  actorUserId: string;
  inboundMessageId: string;
  classification: "interested" | "not_interested" | "needs_human_review";
  confidence: number;
  limitations: string | null;
  extractedFacts: string[];
  suggestedDraftId: string | null;
}): Promise<InboundMessage> {
  const { workspaceId, actorUserId, inboundMessageId, classification, confidence, limitations, extractedFacts, suggestedDraftId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [updated] = await tx
      .update(inboundMessages)
      .set({
        classification,
        classificationConfidence: String(confidence),
        classificationLimitations: limitations,
        extractedFacts,
        suggestedDraftId,
      })
      .where(eq(inboundMessages.id, inboundMessageId))
      .returning();
    if (!updated) throw new NotFoundError(`No inbound message with id ${inboundMessageId}`);

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "reply.classified",
      entityType: "inbound_message",
      entityId: inboundMessageId,
      metadata: { classification, confidence, suggestedDraftId },
    });

    return updated;
  });
}

export async function getReplyIntelligenceRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<{ id: string; state: string; classification: string | null; suggestedDraftId: string | null; failedReason: string | null }> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.aiOps).getJob(runId);
  if (!job) throw new NotFoundError(`No reply-intelligence run with id ${runId}`);

  const state = await job.getState();

  if (state === "completed") {
    const returnValue = job.returnvalue as { classification: string; suggestedDraftId: string | null } | undefined;
    return { id: job.id!, state, classification: returnValue?.classification ?? null, suggestedDraftId: returnValue?.suggestedDraftId ?? null, failedReason: null };
  }
  if (state === "failed") {
    return { id: job.id!, state, classification: null, suggestedDraftId: null, failedReason: job.failedReason ?? "Unknown error" };
  }
  return { id: job.id!, state, classification: null, suggestedDraftId: null, failedReason: null };
}

export async function getInboundMessage(params: {
  workspaceId: string;
  actorUserId: string;
  inboundMessageId: string;
}): Promise<InboundMessage> {
  const { workspaceId, actorUserId, inboundMessageId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [message] = await tx.select().from(inboundMessages).where(eq(inboundMessages.id, inboundMessageId)).limit(1);
    if (!message) throw new NotFoundError(`No inbound message with id ${inboundMessageId}`);
    return message;
  });
}

export async function listInboundMessages(params: {
  workspaceId: string;
  actorUserId: string;
  matchStatus?: "matched" | "ambiguous" | "unknown";
}): Promise<InboundMessage[]> {
  const { workspaceId, actorUserId, matchStatus } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const conditions = matchStatus
      ? and(eq(inboundMessages.workspaceId, workspaceId), eq(inboundMessages.matchStatus, matchStatus))
      : eq(inboundMessages.workspaceId, workspaceId);
    return tx.select().from(inboundMessages).where(conditions).orderBy(desc(inboundMessages.receivedAt));
  });
}
