import { and, desc, eq } from "drizzle-orm";
import { withWorkspace, writeAuditLog, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";
import { NotFoundError, ValidationError } from "@rdv/lib";
import type { CreatorQualification, Creator } from "./entities.js";

const { campaigns, campaignCreators, creators, creatorQualifications, workspaceMembers } = schema;

/**
 * Wave 2 Phase 5 (plan §10): deterministic creator qualification against a
 * campaign's own thresholds and niche requirements — pure arithmetic and
 * string comparison only, never AI. This is the one boundary the plan is
 * explicit and non-negotiable about: "AI must not become the final
 * authority for qualification" — this module has no dependency on
 * @rdv/ai at all, by construction, not just by convention.
 *
 * Threshold shape (plan §14.5 stores `qualification_thresholds` as a
 * flexible jsonb column; the plan names the concept — "follower/view/
 * engagement thresholds" — without fixing field names, so this is the
 * concrete, documented shape this engine reads):
 *   { minSubscribers?, maxSubscribers?, minAvgViews?, minEngagementRate? }
 * A threshold that is set but not measurable for a creator (e.g.
 * minEngagementRate when the creator's engagementRate is null — Phase 3
 * discovery never estimates it) fails that criterion rather than being
 * skipped — never guessing a value to make a creator pass (plan's
 * provenance/confidence principle).
 */
export interface QualificationThresholds {
  minSubscribers?: number;
  maxSubscribers?: number;
  minAvgViews?: number;
  minEngagementRate?: number;
}

export interface QualificationMeasuredValues {
  subscriberCount: number | null;
  avgViews: number | null;
  engagementRate: number | null;
  niche: string | null;
  subNiche: string | null;
}

export interface QualificationCheckResult {
  passed: boolean;
  reasons: string[];
  measuredValues: QualificationMeasuredValues;
}

function toMeasuredValues(creator: Creator): QualificationMeasuredValues {
  return {
    subscriberCount: creator.subscriberCount,
    avgViews: creator.avgViews,
    engagementRate: creator.engagementRate === null ? null : Number(creator.engagementRate),
    niche: creator.niche,
    subNiche: creator.subNiche,
  };
}

function matchesNicheRequirements(nicheRequirements: string[] | null | undefined, measured: QualificationMeasuredValues): boolean {
  if (!nicheRequirements || nicheRequirements.length === 0) return true;
  const required = nicheRequirements.map((n) => n.toLowerCase().trim());
  const candidates = [measured.niche, measured.subNiche].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase().trim());
  return candidates.some((c) => required.includes(c));
}

/** Pure, deterministic — exported directly so it's testable without touching the database. */
export function evaluateQualification(
  thresholds: QualificationThresholds,
  nicheRequirements: string[] | null | undefined,
  creator: Creator
): QualificationCheckResult {
  const measured = toMeasuredValues(creator);
  const reasons: string[] = [];

  if (thresholds.minSubscribers !== undefined) {
    if (measured.subscriberCount === null || measured.subscriberCount < thresholds.minSubscribers) {
      reasons.push(`subscriberCount ${measured.subscriberCount ?? "unknown"} is below minSubscribers ${thresholds.minSubscribers}`);
    }
  }
  if (thresholds.maxSubscribers !== undefined) {
    if (measured.subscriberCount === null || measured.subscriberCount > thresholds.maxSubscribers) {
      reasons.push(`subscriberCount ${measured.subscriberCount ?? "unknown"} is above maxSubscribers ${thresholds.maxSubscribers}`);
    }
  }
  if (thresholds.minAvgViews !== undefined) {
    if (measured.avgViews === null || measured.avgViews < thresholds.minAvgViews) {
      reasons.push(`avgViews ${measured.avgViews ?? "unknown"} is below minAvgViews ${thresholds.minAvgViews}`);
    }
  }
  if (thresholds.minEngagementRate !== undefined) {
    if (measured.engagementRate === null || measured.engagementRate < thresholds.minEngagementRate) {
      reasons.push(
        `engagementRate ${measured.engagementRate ?? "unknown"} is below minEngagementRate ${thresholds.minEngagementRate}`
      );
    }
  }
  if (!matchesNicheRequirements(nicheRequirements, measured)) {
    reasons.push(`niche/subNiche does not match required niches: ${(nicheRequirements ?? []).join(", ")}`);
  }

  return { passed: reasons.length === 0, reasons, measuredValues: measured };
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
 * Evaluates every shortlisted creator on a campaign against that
 * campaign's own thresholds/niche requirements, right now, synchronously
 * (deterministic — no AI, so no reason to make this async). Always
 * inserts a new row per creator (append-only — plan §10: re-evaluating
 * after a threshold change produces a new log row rather than
 * overwriting the previous one). `thresholds_snapshot` captures the
 * exact thresholds in effect at evaluation time.
 */
export async function qualifyCampaignCreators(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CreatorQualification[]> {
  const { workspaceId, actorUserId, campaignId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [campaign] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) throw new NotFoundError(`No campaign with id ${campaignId}`);

    const shortlist = await tx.select().from(campaignCreators).where(eq(campaignCreators.campaignId, campaignId));
    if (shortlist.length === 0) {
      throw new ValidationError("This campaign has no shortlisted creators to qualify");
    }

    const thresholds = (campaign.qualificationThresholds ?? {}) as QualificationThresholds;
    const nicheRequirements = campaign.nicheRequirements as string[] | null;

    const results: CreatorQualification[] = [];
    for (const entry of shortlist) {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, entry.creatorId)).limit(1);
      if (!creator) continue;

      const evaluation = evaluateQualification(thresholds, nicheRequirements, creator);

      const [row] = await tx
        .insert(creatorQualifications)
        .values({
          workspaceId,
          campaignId,
          creatorId: creator.id,
          thresholdsSnapshot: { thresholds, nicheRequirements: nicheRequirements ?? [] },
          measuredValues: { ...evaluation.measuredValues, reasons: evaluation.reasons },
          passed: evaluation.passed,
        })
        .returning();
      if (row) results.push(row);
    }

    await writeAuditLog(tx, {
      workspaceId,
      actorUserId,
      action: "campaign.creators_qualified",
      entityType: "campaign",
      entityId: campaignId,
      metadata: { count: results.length, passed: results.filter((r) => r.passed).length },
    });

    return results;
  });
}

/** Latest qualification per creator for this campaign (append-only log — "current" is the newest row, a query pattern per plan §14.4). */
export async function listCurrentQualifications(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CreatorQualification[]> {
  const { workspaceId, actorUserId, campaignId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const all = await tx
      .select()
      .from(creatorQualifications)
      .where(and(eq(creatorQualifications.workspaceId, workspaceId), eq(creatorQualifications.campaignId, campaignId)))
      .orderBy(desc(creatorQualifications.evaluatedAt));

    const latestByCreator = new Map<string, CreatorQualification>();
    for (const row of all) {
      if (!latestByCreator.has(row.creatorId)) latestByCreator.set(row.creatorId, row);
    }
    return [...latestByCreator.values()];
  });
}

export async function listQualificationHistory(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  creatorId: string;
}): Promise<CreatorQualification[]> {
  const { workspaceId, actorUserId, campaignId, creatorId } = params;
  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");
    return tx
      .select()
      .from(creatorQualifications)
      .where(and(eq(creatorQualifications.campaignId, campaignId), eq(creatorQualifications.creatorId, creatorId)))
      .orderBy(desc(creatorQualifications.evaluatedAt));
  });
}
