import { and, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { CreatorAffiliate, WhopConversion } from "./entities.js";
import { getWhopProvider, resolveWhopProviderName } from "./whopProvider.js";
import { recordMailboxSync, getMailboxSyncState } from "./providerMailboxState.js";
// Side-effect import: registers the Mock provider so it is always
// available wherever @rdv/domain is used, mirroring outreachSend.ts.
import "./providers/mockWhopProvider.js";

const { workspaceMembers, creators, creatorAffiliates, creatorAffiliateAttempts, whopConversions } = schema;

/**
 * Wave 4 (Whop Affiliate/Conversion, product vision §"Human-triggered Whop
 * affiliate creation and polling-based conversion tracking"): mirrors
 * packages/domain/src/outreachSend.ts's design exactly — idempotent
 * request, interruption-safe execution against the provider abstraction,
 * append-only per-attempt history, real execution-time re-checks, never a
 * fabricated success.
 *
 * Affiliate creation is human-triggered ONLY — requestAffiliateCreation is
 * the one and only code path that can create a creator_affiliates row, and
 * it requires an explicit actor (never called by any AI operation or
 * automatic process), per the product vision's "AI may never... create
 * affiliates".
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export function computeAffiliateIdempotencyKey(creatorId: string, campaignId: string | null): string {
  return `${creatorId}:${campaignId ?? "none"}`;
}

/**
 * Human-triggered affiliate creation request. Idempotent: a duplicate
 * request for the same creator (+ campaign, if given) returns the
 * existing row rather than creating a second one — same pattern as
 * outreachSend.scheduleSend. Admin-only, matching the existing bar for
 * "the action that makes an external commitment" (see decideApproval in
 * approvals.ts).
 */
export async function requestAffiliateCreation(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  campaignId?: string | null;
  commercialMetadata?: Record<string, unknown> | null;
}): Promise<CreatorAffiliate> {
  const { workspaceId, actorUserId, creatorId, campaignId = null, commercialMetadata = null } = params;

  const affiliate = await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "admin");

    const [creator] = await tx.select().from(creators).where(eq(creators.id, creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${creatorId}`);
    if (!creator.contactEmail) {
      throw new ValidationError("This creator has no contact email on file — cannot request affiliate creation");
    }

    const idempotencyKey = computeAffiliateIdempotencyKey(creatorId, campaignId);
    const provider = resolveWhopProviderName();

    await tx
      .insert(creatorAffiliates)
      .values({ workspaceId, creatorId, campaignId, provider, idempotencyKey, commercialMetadata, requestedBy: actorUserId })
      .onConflictDoNothing({ target: [creatorAffiliates.workspaceId, creatorAffiliates.idempotencyKey] });

    const row = oneOrThrow(
      await tx
        .select()
        .from(creatorAffiliates)
        .where(and(eq(creatorAffiliates.workspaceId, workspaceId), eq(creatorAffiliates.idempotencyKey, idempotencyKey)))
        .limit(1),
      "select creator_affiliate after idempotent insert"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "creator_affiliate.requested",
      entityType: "creator_affiliate",
      entityId: row.id,
      metadata: { creatorId, campaignId, commercialMetadata },
    });

    return row;
  });

  if (affiliate.status === "pending") {
    await getQueue(QUEUE_LANES.whopSync).add("whop_create_affiliate", { workspaceId, creatorAffiliateId: affiliate.id });
  }

  return affiliate;
}

export async function getCreatorAffiliate(params: {
  workspaceId: string;
  actorUserId: string;
  creatorAffiliateId: string;
}): Promise<CreatorAffiliate> {
  const { workspaceId, actorUserId, creatorAffiliateId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [row] = await tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.id, creatorAffiliateId)).limit(1);
    if (!row) throw new NotFoundError(`No creator affiliate with id ${creatorAffiliateId}`);
    return row;
  });
}

export async function listCreatorAffiliatesForCreator(params: {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
}): Promise<CreatorAffiliate[]> {
  const { workspaceId, actorUserId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.creatorId, creatorId));
  });
}

/**
 * Called only by the worker's `whop_create_affiliate` job processor.
 * Interruption safety (same design as outreachSend.executeScheduledSend):
 * if this function finds the row already in `creating` state, a previous
 * invocation reached the point of calling the provider and then the
 * process died before recording the result. Rather than silently retry
 * (risking a real duplicate affiliate) or silently give up, this is
 * recorded as `unknown` and left for human review.
 */
export async function executeAffiliateCreation(params: { workspaceId: string; creatorAffiliateId: string }): Promise<{ status: string }> {
  const { workspaceId, creatorAffiliateId } = params;

  const prepared = await withWorkspace(workspaceId, async (tx) => {
    const [affiliate] = await tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.id, creatorAffiliateId)).limit(1);
    if (!affiliate) throw new NotFoundError(`No creator affiliate with id ${creatorAffiliateId}`);

    if (affiliate.status === "creating") {
      await tx
        .update(creatorAffiliates)
        .set({
          status: "unknown",
          statusReason: "Execution was interrupted after the provider was contacted; the real outcome could not be confirmed. Requires human review.",
        })
        .where(eq(creatorAffiliates.id, creatorAffiliateId));
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: null,
        action: "creator_affiliate.interrupted_marked_unknown",
        entityType: "creator_affiliate",
        entityId: creatorAffiliateId,
        metadata: {},
      });
      return { done: true as const, status: "unknown" };
    }

    if (affiliate.status !== "pending") {
      return { done: true as const, status: affiliate.status };
    }

    const [creator] = await tx.select().from(creators).where(eq(creators.id, affiliate.creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${affiliate.creatorId}`);
    if (!creator.contactEmail) {
      await tx
        .update(creatorAffiliates)
        .set({ status: "failed", statusReason: "Creator no longer has a contact email on file." })
        .where(eq(creatorAffiliates.id, creatorAffiliateId));
      return { done: true as const, status: "failed" };
    }

    await tx.update(creatorAffiliates).set({ status: "creating" }).where(eq(creatorAffiliates.id, creatorAffiliateId));

    return { done: false as const, affiliate, creator, attemptNumber: 1 };
  });

  if (prepared.done) return { status: prepared.status };

  const { affiliate, creator, attemptNumber } = prepared;

  // Deliberately outside any DB transaction — never hold a Postgres
  // transaction open across an external network call.
  const provider = getWhopProvider(affiliate.provider);
  const outcome = await provider.createAffiliate({
    creatorIdentity: creator.contactEmail!,
    commercialMetadata: affiliate.commercialMetadata as Record<string, unknown> | null,
    idempotencyKey: affiliate.idempotencyKey,
  });

  return withWorkspace(workspaceId, async (tx) => {
    const now = new Date();

    if (outcome.status === "active") {
      await tx
        .update(creatorAffiliates)
        .set({
          status: "active",
          statusReason: null,
          providerAffiliateId: outcome.providerAffiliateId,
          affiliateCode: outcome.affiliateCode,
          confirmedAt: now,
        })
        .where(eq(creatorAffiliates.id, creatorAffiliateId));
    } else {
      await tx
        .update(creatorAffiliates)
        .set({ status: outcome.status, statusReason: outcome.errorMessage })
        .where(eq(creatorAffiliates.id, creatorAffiliateId));
    }

    await tx.insert(creatorAffiliateAttempts).values({
      workspaceId,
      creatorAffiliateId,
      attemptNumber,
      result: outcome.status,
      providerAffiliateId: outcome.status === "active" ? outcome.providerAffiliateId : null,
      errorMessage: outcome.status === "active" ? null : outcome.errorMessage,
      rawProviderResponse: null,
    });

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId: null,
      action: `creator_affiliate.${outcome.status}`,
      entityType: "creator_affiliate",
      entityId: creatorAffiliateId,
      metadata: {
        attemptNumber,
        providerAffiliateId: outcome.status === "active" ? outcome.providerAffiliateId : null,
        errorMessage: outcome.status === "active" ? null : outcome.errorMessage,
      },
    });

    return { status: outcome.status };
  });
}

/** Real conversion event ingestion, deduped on (workspace, provider, provider_event_id) exactly like inbound_messages' webhook dedupe. Never fabricated — populated only by the polling reconciliation job or, in tests, direct fixture data (same precedent as ingestInboundMessage). */
export async function ingestWhopConversion(params: {
  workspaceId: string;
  creatorAffiliateId: string;
  provider: string;
  providerEventId: string;
  eventType: "click" | "order" | "conversion";
  occurredAt: Date;
  amount?: number | null;
  currency?: string | null;
  rawPayload?: unknown;
}): Promise<{ conversion: WhopConversion; wasNew: boolean }> {
  const { workspaceId, creatorAffiliateId, provider, providerEventId, eventType, occurredAt, amount = null, currency = null, rawPayload = null } =
    params;

  return withWorkspace(workspaceId, async (tx) => {
    const [affiliate] = await tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.id, creatorAffiliateId)).limit(1);
    if (!affiliate) throw new NotFoundError(`No creator affiliate with id ${creatorAffiliateId}`);

    const inserted = await tx
      .insert(whopConversions)
      .values({
        workspaceId,
        creatorAffiliateId,
        provider,
        providerEventId,
        eventType,
        occurredAt,
        amount: amount !== null ? String(amount) : null,
        currency,
        rawPayload,
      })
      .onConflictDoNothing({ target: [whopConversions.workspaceId, whopConversions.provider, whopConversions.providerEventId] })
      .returning();

    if (inserted[0]) {
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: null,
        action: "whop_conversion.ingested",
        entityType: "whop_conversion",
        entityId: inserted[0].id,
        metadata: { creatorAffiliateId, eventType, amount },
      });
      return { conversion: inserted[0], wasNew: true };
    }

    const existing = oneOrThrow(
      await tx
        .select()
        .from(whopConversions)
        .where(
          and(
            eq(whopConversions.workspaceId, workspaceId),
            eq(whopConversions.provider, provider),
            eq(whopConversions.providerEventId, providerEventId)
          )
        )
        .limit(1),
      "select whop_conversion after dedupe conflict"
    );
    return { conversion: existing, wasNew: false };
  });
}

export async function listConversionsForAffiliate(params: {
  workspaceId: string;
  actorUserId: string;
  creatorAffiliateId: string;
}): Promise<WhopConversion[]> {
  const { workspaceId, actorUserId, creatorAffiliateId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(whopConversions).where(eq(whopConversions.creatorAffiliateId, creatorAffiliateId));
  });
}

/**
 * Called only by the worker's `whop_conversion_poll` job processor. Polls
 * every real `active` affiliate in the workspace for new conversions,
 * reusing the existing provider_mailbox_state table (workspace + provider
 * + generic sync cursor — see migration 0011's design note) rather than
 * adding a near-duplicate table.
 */
export async function pollWhopConversions(params: { workspaceId: string }): Promise<{ affiliatesPolled: number; newConversions: number }> {
  const { workspaceId } = params;

  const activeAffiliates = await withWorkspace(workspaceId, async (tx) =>
    tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.status, "active"))
  );

  const syncState = await getMailboxSyncState({ workspaceId, provider: "whop" });
  const provider = getWhopProvider(resolveWhopProviderName());

  let newConversions = 0;
  for (const affiliate of activeAffiliates) {
    if (!affiliate.providerAffiliateId) continue;
    const { records } = await provider.getConversions({
      providerAffiliateId: affiliate.providerAffiliateId,
      sinceCursor: syncState?.syncCursor ?? null,
    });
    for (const record of records) {
      const { wasNew } = await ingestWhopConversion({
        workspaceId,
        creatorAffiliateId: affiliate.id,
        provider: affiliate.provider,
        providerEventId: record.providerEventId,
        eventType: record.eventType,
        occurredAt: record.occurredAt,
        amount: record.amount,
        currency: record.currency,
        rawPayload: record.rawPayload,
      });
      if (wasNew) newConversions++;
    }
  }

  await recordMailboxSync({ workspaceId, provider: "whop", syncCursor: syncState?.syncCursor ?? null });

  return { affiliatesPolled: activeAffiliates.length, newConversions };
}
