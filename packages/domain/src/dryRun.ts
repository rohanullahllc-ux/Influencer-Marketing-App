import { and, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { getQueue, QUEUE_LANES } from "@rdv/queue";
import { NotFoundError, ValidationError, oneOrThrow } from "@rdv/lib";
import type { DryRunEvaluation, DryRunEvaluationResult } from "./entities.js";
import { evaluateSafetyGate, checkScheduleValidity, type SendingWindow } from "./safetyGate.js";
import { isSuppressed } from "./suppressions.js";

const {
  workspaces,
  campaigns,
  campaignCreators,
  creators,
  approvals,
  dryRunEvaluations,
  dryRunEvaluationResults,
  workspaceMembers,
} = schema;

/**
 * Wave 2 Phase 7 (plan §12): the dry-run job — shows eligible vs. blocked
 * messages with exact reasons, without ever calling a real provider (no
 * provider adapter exists in this codebase to call, by design). Runs on
 * the `outreach-send` lane, per plan §12 and Wave 1's own reservation of
 * that lane for exactly this purpose (packages/queue/src/lanes.ts).
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

export async function requestDryRun(params: {
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
      throw new ValidationError("This campaign has no shortlisted creators to dry-run");
    }
  });

  const job = await getQueue(QUEUE_LANES.outreachSend).add("dry_run_evaluate", { workspaceId, actorUserId, campaignId });
  if (!job.id) throw new Error("dry_run_evaluate job was enqueued without an id");
  return { jobId: job.id };
}

/**
 * Called only by the worker's `dry_run_evaluate` job processor. Never
 * imports or calls a provider adapter — none exists in this codebase.
 * Iterates the campaign's shortlist in a deterministic order (added_at),
 * evaluating every creator against the safety gate; sending-limit/first-
 * send-cap/duplicate checks accumulate across this run using both this
 * campaign's full dry-run history and the eligible creators already
 * decided earlier in this same run.
 */
export async function performDryRunEvaluation(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<{ evaluationId: string; eligibleCount: number; blockedCount: number }> {
  const { workspaceId, actorUserId, campaignId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) throw new NotFoundError(`No workspace with id ${workspaceId}`);

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const shortlist = await tx
      .select()
      .from(campaignCreators)
      .where(eq(campaignCreators.campaignId, campaignId))
      .orderBy(campaignCreators.addedAt);

    // Prior dry-run history for this campaign, for the cap/duplicate
    // checks — fetched per evaluation since dry_run_evaluation_results is
    // keyed by dry_run_evaluation_id, not campaign_id directly.
    const priorEvaluations = await tx.select().from(dryRunEvaluations).where(eq(dryRunEvaluations.campaignId, campaignId));
    const allPriorResults: (typeof dryRunEvaluationResults.$inferSelect)[] = [];
    for (const priorEvaluation of priorEvaluations) {
      const rows = await tx
        .select()
        .from(dryRunEvaluationResults)
        .where(eq(dryRunEvaluationResults.dryRunEvaluationId, priorEvaluation.id));
      allPriorResults.push(...rows);
    }

    const priorEligibleCreatorIds = new Set(allPriorResults.filter((r) => r.eligible).map((r) => r.creatorId));
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const priorEvaluationsById = new Map(priorEvaluations.map((e) => [e.id, e]));
    const priorEligibleWithinLast24h = allPriorResults.filter((r) => {
      if (!r.eligible) return false;
      const evaluation = priorEvaluationsById.get(r.dryRunEvaluationId);
      return evaluation ? evaluation.evaluatedAt >= twentyFourHoursAgo : false;
    }).length;

    const firstSendCap = campaign.firstSendCap ?? null;
    const dailyCap = (campaign.sendingLimits as { dailyCap?: number } | null)?.dailyCap ?? null;
    const sendingWindow = campaign.sendingWindow as SendingWindow | null;

    let cumulativeDistinctEligible = priorEligibleCreatorIds.size;
    let cumulativeDailyEligible = priorEligibleWithinLast24h;

    const evaluation = oneOrThrow(
      await tx.insert(dryRunEvaluations).values({ workspaceId, campaignId, triggeredBy: actorUserId, summary: {} }).returning(),
      "insert dry_run_evaluation"
    );

    const resultRows: DryRunEvaluationResult[] = [];
    let eligibleCount = 0;

    for (const entry of shortlist) {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, entry.creatorId)).limit(1);
      if (!creator) continue;

      const [approval] = await tx
        .select()
        .from(approvals)
        .where(and(eq(approvals.campaignId, campaignId), eq(approvals.creatorId, creator.id), eq(approvals.status, "approved")))
        .limit(1);

      const suppressed = await isSuppressed({ workspaceId, identity: creator.contactEmail });

      const isDuplicate = priorEligibleCreatorIds.has(creator.id);
      const wouldExceedFirstSendCap =
        firstSendCap !== null && !isDuplicate ? cumulativeDistinctEligible + 1 > firstSendCap : false;
      const wouldExceedDailyCap = dailyCap !== null && !isDuplicate ? cumulativeDailyEligible + 1 > dailyCap : false;

      const schedule = checkScheduleValidity({
        sendingWindow,
        creatorTimezone: creator.timezone,
        workspaceDefaultTimezone: workspace.defaultTimezone,
      });

      const gate = evaluateSafetyGate({
        workspaceActive: workspace.status === "active",
        campaignStatus: campaign.status,
        sendingEnabled: workspace.sendingEnabled,
        isSuppressed: suppressed,
        hasValidApproval: Boolean(approval),
        dailyCapReached: wouldExceedDailyCap,
        firstSendCapReached: wouldExceedFirstSendCap,
        isDuplicate,
        scheduleValid: schedule.valid,
        scheduleReason: schedule.reason,
      });

      if (gate.eligible) {
        eligibleCount++;
        cumulativeDistinctEligible++;
        cumulativeDailyEligible++;
      }

      const [resultRow] = await tx
        .insert(dryRunEvaluationResults)
        .values({
          workspaceId,
          dryRunEvaluationId: evaluation.id,
          creatorId: creator.id,
          approvalId: approval?.id ?? null,
          eligible: gate.eligible,
          blockReasons: gate.blockReasons,
        })
        .returning();
      if (resultRow) resultRows.push(resultRow);
    }

    await tx
      .update(dryRunEvaluations)
      .set({ summary: { total: shortlist.length, eligible: eligibleCount, blocked: shortlist.length - eligibleCount } })
      .where(eq(dryRunEvaluations.id, evaluation.id));

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.dry_run_evaluated",
      entityType: "dry_run_evaluation",
      entityId: evaluation.id,
      metadata: { campaignId, eligibleCount, blockedCount: shortlist.length - eligibleCount },
    });

    return { evaluationId: evaluation.id, eligibleCount, blockedCount: shortlist.length - eligibleCount };
  });
}

export async function getDryRunRunStatus(params: {
  workspaceId: string;
  actorUserId: string;
  runId: string;
}): Promise<{ id: string; state: string; evaluationId: string | null; failedReason: string | null }> {
  const { workspaceId, actorUserId, runId } = params;

  await withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
  });

  const job = await getQueue(QUEUE_LANES.outreachSend).getJob(runId);
  if (!job) throw new NotFoundError(`No dry-run with id ${runId}`);

  const state = await job.getState();

  if (state === "completed") {
    const returnValue = job.returnvalue as { evaluationId: string } | undefined;
    return { id: job.id!, state, evaluationId: returnValue?.evaluationId ?? null, failedReason: null };
  }
  if (state === "failed") {
    return { id: job.id!, state, evaluationId: null, failedReason: job.failedReason ?? "Unknown error" };
  }
  return { id: job.id!, state, evaluationId: null, failedReason: null };
}

export async function getDryRunEvaluation(params: {
  workspaceId: string;
  actorUserId: string;
  evaluationId: string;
}): Promise<{ evaluation: DryRunEvaluation; results: DryRunEvaluationResult[] }> {
  const { workspaceId, actorUserId, evaluationId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [evaluation] = await tx.select().from(dryRunEvaluations).where(eq(dryRunEvaluations.id, evaluationId)).limit(1);
    if (!evaluation) throw new NotFoundError(`No dry-run evaluation with id ${evaluationId}`);

    const results = await tx
      .select()
      .from(dryRunEvaluationResults)
      .where(eq(dryRunEvaluationResults.dryRunEvaluationId, evaluationId));

    return { evaluation, results };
  });
}

export async function listDryRunEvaluations(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<DryRunEvaluation[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx.select().from(dryRunEvaluations).where(eq(dryRunEvaluations.campaignId, campaignId));
  });
}
