import { and, eq, gte } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { OutreachSend } from "./entities.js";
import { evaluateSafetyGate, checkScheduleValidity, type SendingWindow } from "./safetyGate.js";
import { isSuppressed } from "./suppressions.js";
import { hasActiveCrossCampaignContact } from "./crossCampaignContact.js";
import { getOutreachProvider, resolveOutreachProviderName } from "./outreachProvider.js";
// Side-effect import: registers the Mock provider so it is always
// available wherever @rdv/domain is used, mirroring how @rdv/ai
// operations self-register on import.
import "./providers/mockOutreachProvider.js";

const { workspaces, campaigns, creators, approvals, outreachSends, outreachSendAttempts, workspaceMembers, creatorRelationships } = schema;

/**
 * Wave 3 (Live Outreach + Reply Intelligence): real send execution against
 * the outreach provider abstraction, with the exact same deterministic
 * safety gate dry-run already proved out in Wave 2 Phase 7 — re-evaluated
 * for real at execution time, never trusting a stale dry-run or the state
 * of the world at schedule time. See docs/AUTONOMOUS_V1_PROGRESS.md for
 * the provider-selection blocker this is deliberately built against a
 * Mock provider to work around without waiting on it.
 */

export function computeIdempotencyKey(campaignId: string, creatorId: string, outreachStep: string): string {
  return `${campaignId}:${creatorId}:${outreachStep}`;
}

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

/**
 * Schedules a send for a real, approved (and still valid) approval.
 * Idempotent: re-scheduling the same campaign+creator+outreach_step
 * returns the existing row rather than creating a second one (product
 * vision: "atomic send idempotency keyed to Campaign + Creator + Outreach
 * Step"). Enqueues the real execution job (delayed if `scheduledFor` is in
 * the future) — the queued job id is not returned to the caller because
 * the durable `outreach_sends` row (polled by id) is the actual run
 * record, not the BullMQ job, since a far-future scheduled send may not
 * run for a long time.
 */
export async function scheduleSend(params: {
  workspaceId: string;
  actorUserId: string;
  approvalId: string;
  outreachStep?: string;
  scheduledFor?: Date | null;
  crossCampaignOverride?: boolean;
}): Promise<OutreachSend> {
  const { workspaceId, actorUserId, approvalId, scheduledFor = null, crossCampaignOverride = false } = params;
  const outreachStep = params.outreachStep?.trim() || "initial";

  const send = await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [approval] = await tx.select().from(approvals).where(eq(approvals.id, approvalId)).limit(1);
    if (!approval) throw new NotFoundError(`No approval with id ${approvalId}`);
    if (approval.status !== "approved") {
      throw new ValidationError(`Only an approved approval can be scheduled for sending (this one is "${approval.status}")`);
    }

    const [creator] = await tx.select().from(creators).where(eq(creators.id, approval.creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${approval.creatorId}`);
    if (!creator.contactEmail) {
      throw new ValidationError("This creator has no contact email on file — cannot schedule a send");
    }

    const idempotencyKey = computeIdempotencyKey(approval.campaignId, approval.creatorId, outreachStep);
    const recipientIdentity = creator.contactEmail.trim().toLowerCase();
    const provider = resolveOutreachProviderName();

    await tx
      .insert(outreachSends)
      .values({
        workspaceId,
        campaignId: approval.campaignId,
        creatorId: approval.creatorId,
        approvalId: approval.id,
        outreachStep,
        idempotencyKey,
        recipientIdentity,
        provider,
        scheduledFor,
        crossCampaignOverride,
        createdBy: actorUserId,
      })
      .onConflictDoNothing({ target: [outreachSends.workspaceId, outreachSends.idempotencyKey] });

    // Re-select regardless of whether the insert happened or was skipped
    // by the idempotency conflict — this always returns the one canonical
    // row for this key.
    const row = oneOrThrow(
      await tx
        .select()
        .from(outreachSends)
        .where(and(eq(outreachSends.workspaceId, workspaceId), eq(outreachSends.idempotencyKey, idempotencyKey)))
        .limit(1),
      "select outreach_send after idempotent insert"
    );

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "outreach_send.scheduled",
      entityType: "outreach_send",
      entityId: row.id,
      metadata: { approvalId, campaignId: approval.campaignId, creatorId: approval.creatorId, outreachStep, scheduledFor, crossCampaignOverride },
    });

    return row;
  });

  // Only enqueue if this schedule call actually created/owns a fresh
  // 'scheduled' row (a re-schedule of an already-sent/failed/blocked send
  // must never re-enqueue execution).
  if (send.status === "scheduled") {
    const delay = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
    await getQueue(QUEUE_LANES.outreachSend).add(
      "outreach_send_execute",
      { workspaceId, outreachSendId: send.id },
      { delay }
    );
  }

  return send;
}

export async function getOutreachSend(params: {
  workspaceId: string;
  actorUserId: string;
  outreachSendId: string;
}): Promise<OutreachSend> {
  const { workspaceId, actorUserId, outreachSendId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    const [row] = await tx.select().from(outreachSends).where(eq(outreachSends.id, outreachSendId)).limit(1);
    if (!row) throw new NotFoundError(`No outreach send with id ${outreachSendId}`);
    return row;
  });
}

export async function listOutreachSendsForCampaign(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<OutreachSend[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(outreachSends).where(eq(outreachSends.campaignId, campaignId));
  });
}

/**
 * Called only by the worker's `outreach_send_execute` job processor.
 * Re-evaluates the FULL safety gate for real, right now — never trusts
 * anything decided at schedule time except the human's cross-campaign
 * override decision itself (which is a decision, not a fact, and is
 * honored as recorded).
 *
 * Interruption safety (product vision: "prefer safe interruption over
 * unsafe continuation", "never treat a failed background job as proof a
 * send failed"): if this function is invoked and finds the row already in
 * `sending` state, that means a *previous* invocation reached the point of
 * calling the provider and then the process died before recording the
 * result — we do not know whether that send actually went out. Rather
 * than silently retry (risking a real duplicate send) or silently give up
 * (risking a real message never being recorded), this is recorded as
 * `unknown` and left for human review. This is exactly the explicit
 * UNKNOWN/AMBIGUOUS state the product vision requires.
 */
export async function executeScheduledSend(params: { workspaceId: string; outreachSendId: string }): Promise<{ status: string }> {
  const { workspaceId, outreachSendId } = params;

  const prepared = await withWorkspace(workspaceId, async (tx) => {
    const [send] = await tx.select().from(outreachSends).where(eq(outreachSends.id, outreachSendId)).limit(1);
    if (!send) throw new NotFoundError(`No outreach send with id ${outreachSendId}`);

    if (send.status === "sending") {
      // A prior invocation was interrupted after contacting the provider.
      await tx
        .update(outreachSends)
        .set({
          status: "unknown",
          statusReason: "Execution was interrupted after the provider was contacted; the real outcome could not be confirmed. Requires human review.",
        })
        .where(eq(outreachSends.id, outreachSendId));
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: null,
        action: "outreach_send.interrupted_marked_unknown",
        entityType: "outreach_send",
        entityId: outreachSendId,
        metadata: {},
      });
      return { done: true as const, status: "unknown" };
    }

    if (send.status !== "scheduled") {
      // Already terminal (sent/failed/blocked/cancelled/unknown) — no-op.
      return { done: true as const, status: send.status };
    }

    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) throw new NotFoundError(`No workspace with id ${workspaceId}`);
    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, send.campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${send.campaignId}`);
    const [creator] = await tx.select().from(creators).where(eq(creators.id, send.creatorId)).limit(1);
    if (!creator) throw new NotFoundError(`No creator with id ${send.creatorId}`);
    const [approval] = await tx.select().from(approvals).where(eq(approvals.id, send.approvalId)).limit(1);
    if (!approval) throw new NotFoundError(`No approval with id ${send.approvalId}`);

    const suppressed = await isSuppressed({ workspaceId, identity: send.recipientIdentity });
    const [relationship] = await tx
      .select({ status: creatorRelationships.status })
      .from(creatorRelationships)
      .where(eq(creatorRelationships.creatorId, send.creatorId))
      .limit(1);
    // Checks both the CRM relationship status (Wave 4, the reachable
    // write path) and the creator's own status (Wave 2 schema also
    // carries this value) -- a direct human "do not contact" instruction
    // from either source is never overridable, unlike the cross-campaign
    // safeguard.
    const creatorDoNotContact = relationship?.status === "do_not_contact" || creator.status === "do_not_contact";
    const crossCampaignBlocked = await hasActiveCrossCampaignContact(tx, {
      workspaceId,
      campaignId: send.campaignId,
      recipientIdentity: send.recipientIdentity,
    });

    if (send.crossCampaignOverride) {
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: send.createdBy,
        action: "outreach_send.cross_campaign_override_in_effect",
        entityType: "outreach_send",
        entityId: outreachSendId,
        metadata: { crossCampaignBlocked },
      });
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentForCampaign = await tx
      .select({ creatorId: outreachSends.creatorId, sentAt: outreachSends.sentAt })
      .from(outreachSends)
      .where(and(eq(outreachSends.campaignId, send.campaignId), eq(outreachSends.status, "sent")));

    const distinctSentCreators = new Set(sentForCampaign.map((r) => r.creatorId));
    const sentWithinLast24h = sentForCampaign.filter((r) => r.sentAt && r.sentAt >= twentyFourHoursAgo).length;

    const firstSendCap = campaign.firstSendCap ?? null;
    const dailyCap = (campaign.sendingLimits as { dailyCap?: number } | null)?.dailyCap ?? null;
    const alreadyCountedForThisCreator = distinctSentCreators.has(send.creatorId);
    const firstSendCapReached =
      firstSendCap !== null && !alreadyCountedForThisCreator ? distinctSentCreators.size + 1 > firstSendCap : false;
    const dailyCapReached = dailyCap !== null ? sentWithinLast24h + 1 > dailyCap : false;

    const schedule = checkScheduleValidity({
      sendingWindow: campaign.sendingWindow as SendingWindow | null,
      creatorTimezone: creator.timezone,
      workspaceDefaultTimezone: workspace.defaultTimezone,
    });

    const gate = evaluateSafetyGate({
      workspaceActive: workspace.status === "active",
      campaignStatus: campaign.status,
      sendingEnabled: workspace.sendingEnabled,
      isSuppressed: suppressed,
      creatorDoNotContact,
      hasValidApproval: approval.status === "approved",
      dailyCapReached,
      firstSendCapReached,
      crossCampaignBlocked,
      crossCampaignOverride: send.crossCampaignOverride,
      // The unique (workspace_id, idempotency_key) index already makes a
      // true duplicate row structurally impossible at real-execution time
      // (dry-run's `isDuplicate` simulates this same intent across
      // ephemeral preview runs, where no persistent row exists yet).
      isDuplicate: false,
      scheduleValid: schedule.valid,
      scheduleReason: schedule.reason,
    });

    if (!gate.eligible) {
      await tx
        .update(outreachSends)
        .set({ status: "blocked", statusReason: gate.blockReasons.join(", ") })
        .where(eq(outreachSends.id, outreachSendId));
      await writeAuditLog(tx, {
        workspaceId,
        actorUserId: null,
        action: "outreach_send.blocked",
        entityType: "outreach_send",
        entityId: outreachSendId,
        metadata: { reasons: gate.blockReasons },
      });
      return { done: true as const, status: "blocked" };
    }

    // Eligible — mark `sending` and commit *before* contacting the
    // provider, so an interruption after this point is visible and
    // correctly resolves to `unknown` on the next invocation (see above)
    // rather than a stale `scheduled` row silently being retried forever.
    await tx.update(outreachSends).set({ status: "sending" }).where(eq(outreachSends.id, outreachSendId));

    return {
      done: false as const,
      send,
      approval,
      attemptNumber: send.attemptCount + 1,
    };
  });

  if (prepared.done) return { status: prepared.status };

  const { send, approval, attemptNumber } = prepared;

  // Deliberately outside any DB transaction — never hold a Postgres
  // transaction open across an external network call.
  const provider = getOutreachProvider(send.provider);
  const outcome = await provider.send({
    to: send.recipientIdentity,
    subject: approval.exactSubject,
    body: approval.exactBody,
    idempotencyKey: send.idempotencyKey,
  });

  return withWorkspace(workspaceId, async (tx) => {
    const now = new Date();
    const common = { attemptCount: attemptNumber, lastAttemptedAt: now };

    if (outcome.status === "sent") {
      await tx
        .update(outreachSends)
        .set({
          ...common,
          status: "sent",
          statusReason: null,
          providerMessageId: outcome.providerMessageId,
          providerThreadId: outcome.providerThreadId ?? null,
          sentAt: now,
        })
        .where(eq(outreachSends.id, outreachSendId));
    } else {
      await tx
        .update(outreachSends)
        .set({ ...common, status: outcome.status, statusReason: outcome.errorMessage })
        .where(eq(outreachSends.id, outreachSendId));
    }

    await tx.insert(outreachSendAttempts).values({
      workspaceId,
      outreachSendId,
      attemptNumber,
      result: outcome.status,
      providerMessageId: outcome.status === "sent" ? outcome.providerMessageId : null,
      errorMessage: outcome.status === "sent" ? null : outcome.errorMessage,
      rawProviderResponse: null,
    });

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId: null,
      action: `outreach_send.${outcome.status}`,
      entityType: "outreach_send",
      entityId: outreachSendId,
      metadata: {
        attemptNumber,
        providerMessageId: outcome.status === "sent" ? outcome.providerMessageId : null,
        errorMessage: outcome.status === "sent" ? null : outcome.errorMessage,
      },
    });

    return { status: outcome.status };
  });
}
