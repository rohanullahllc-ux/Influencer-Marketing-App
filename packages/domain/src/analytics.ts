import { eq } from "drizzle-orm";
import { withWorkspace, schema } from "@rdv/db";
import { requireRole } from "@rdv/auth";

const {
  workspaceMembers,
  products,
  productIntelligence,
  creators,
  campaigns,
  campaignCreators,
  creatorQualifications,
  creatorMatches,
  outreachDrafts,
  approvals,
  outreachSends,
  inboundMessages,
  creatorRelationships,
  creatorTasks,
  creatorNotes,
  creatorAffiliates,
  whopConversions,
} = schema;

/**
 * Wave 5 (Analytics, product vision §"Observed analytics (raw data and
 * derived rates kept distinct)"): every number here comes from a real,
 * stored row — nothing is invented, predicted, or forecast. Observed
 * counts (how many rows exist in a given state) are clearly distinct from
 * calculated rates (a ratio of two observed counts, which can be
 * misleading on a tiny sample — callers/UI must treat a rate over a small
 * `n` with visible caution, never presented as equally confident as a
 * larger one). No ML, no speculative performance forecasting anywhere in
 * this module.
 */

async function requireActorRole(
  tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
  actorUserId: string,
  minimum: "member_operator" | "admin" | "owner"
): Promise<void> {
  const [actorMembership] = await tx.select().from(workspaceMembers).where(eq(workspaceMembers.userId, actorUserId));
  requireRole(actorMembership?.role, minimum);
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** Keeps only the most recent row per group key -- the "current" state of an append-only evaluation log (creator_qualifications/creator_matches). */
function latestPerGroup<T>(rows: T[], groupKey: (row: T) => string, dateOf: (row: T) => Date): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const k = groupKey(row);
    const existing = latest.get(k);
    if (!existing || dateOf(row) > dateOf(existing)) latest.set(k, row);
  }
  return [...latest.values()];
}

export interface AnalyticsSummary {
  products: { total: number; withApprovedIntelligence: number };
  discovery: { totalCreators: number; byProvenance: Record<string, number>; bySource: Record<string, number> };
  qualification: { totalCurrentlyEvaluated: number; passed: number; failed: number; topFailureReasons: Array<{ reason: string; count: number }> };
  matching: { totalCurrentlyMatched: number; averageScore: number | null; sampleSize: number };
  campaigns: { total: number; byStatus: Record<string, number>; totalShortlistEntries: number; byShortlistStatus: Record<string, number> };
  outreach: { totalDrafts: number; byDraftStatus: Record<string, number>; byApprovalStatus: Record<string, number> };
  sends: { total: number; byStatus: Record<string, number> };
  replies: { total: number; byMatchStatus: Record<string, number>; byClassification: Record<string, number>; suggestedResponsesDrafted: number };
  crm: { byRelationshipStatus: Record<string, number>; openTasks: number; totalTasks: number; totalNotes: number };
  whop: {
    affiliates: { total: number; byStatus: Record<string, number> };
    conversions: { total: number; byEventType: Record<string, number>; revenueByCurrency: Array<{ currency: string; total: number }> };
  };
  generatedAt: string;
}

/** Workspace-wide rollup across every V1 build area. Every number is a real count from stored rows at read time -- no caching, no pre-computation, no estimation. */
export async function getWorkspaceAnalytics(params: { workspaceId: string; actorUserId: string }): Promise<AnalyticsSummary> {
  const { workspaceId, actorUserId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [
      allProducts,
      allIntelligence,
      allCreators,
      allCampaigns,
      allCampaignCreators,
      allQualifications,
      allMatches,
      allDrafts,
      allApprovals,
      allSends,
      allMessages,
      allRelationships,
      allTasks,
      allNotes,
      allAffiliates,
      allConversions,
    ] = await Promise.all([
      tx.select().from(products).where(eq(products.workspaceId, workspaceId)),
      tx.select().from(productIntelligence).where(eq(productIntelligence.workspaceId, workspaceId)),
      tx.select().from(creators).where(eq(creators.workspaceId, workspaceId)),
      tx.select().from(campaigns).where(eq(campaigns.workspaceId, workspaceId)),
      tx.select().from(campaignCreators).where(eq(campaignCreators.workspaceId, workspaceId)),
      tx.select().from(creatorQualifications).where(eq(creatorQualifications.workspaceId, workspaceId)),
      tx.select().from(creatorMatches).where(eq(creatorMatches.workspaceId, workspaceId)),
      tx.select().from(outreachDrafts).where(eq(outreachDrafts.workspaceId, workspaceId)),
      tx.select().from(approvals).where(eq(approvals.workspaceId, workspaceId)),
      tx.select().from(outreachSends).where(eq(outreachSends.workspaceId, workspaceId)),
      tx.select().from(inboundMessages).where(eq(inboundMessages.workspaceId, workspaceId)),
      tx.select().from(creatorRelationships).where(eq(creatorRelationships.workspaceId, workspaceId)),
      tx.select().from(creatorTasks).where(eq(creatorTasks.workspaceId, workspaceId)),
      tx.select().from(creatorNotes).where(eq(creatorNotes.workspaceId, workspaceId)),
      tx.select().from(creatorAffiliates).where(eq(creatorAffiliates.workspaceId, workspaceId)),
      tx.select().from(whopConversions).where(eq(whopConversions.workspaceId, workspaceId)),
    ]);

    const approvedIntelligenceProductIds = new Set(allIntelligence.filter((i) => i.status === "approved").map((i) => i.productId));

    const currentQualifications = latestPerGroup(
      allQualifications,
      (q) => `${q.campaignId}:${q.creatorId}`,
      (q) => q.evaluatedAt
    );
    const failureReasonCounts = new Map<string, number>();
    for (const q of currentQualifications) {
      if (q.passed) continue;
      const reasons = (q.measuredValues as { reasons?: string[] } | null)?.reasons ?? [];
      for (const r of reasons) failureReasonCounts.set(r, (failureReasonCounts.get(r) ?? 0) + 1);
    }
    const topFailureReasons = [...failureReasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const currentMatches = latestPerGroup(
      allMatches,
      (m) => `${m.campaignId}:${m.creatorId}`,
      (m) => m.computedAt
    );
    const scores = currentMatches.map((m) => Number(m.score)).filter((s) => Number.isFinite(s));
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

    const suggestedResponsesDrafted = allMessages.filter((m) => m.suggestedDraftId !== null).length;

    const revenueByCurrency = new Map<string, number>();
    for (const c of allConversions) {
      if (c.eventType !== "order" && c.eventType !== "conversion") continue;
      if (c.amount === null) continue;
      const currency = c.currency ?? "UNKNOWN";
      revenueByCurrency.set(currency, (revenueByCurrency.get(currency) ?? 0) + Number(c.amount));
    }

    return {
      products: { total: allProducts.length, withApprovedIntelligence: approvedIntelligenceProductIds.size },
      discovery: {
        totalCreators: allCreators.length,
        byProvenance: countBy(allCreators, (c) => c.provenance),
        bySource: countBy(allCreators, (c) => c.source),
      },
      qualification: {
        totalCurrentlyEvaluated: currentQualifications.length,
        passed: currentQualifications.filter((q) => q.passed).length,
        failed: currentQualifications.filter((q) => !q.passed).length,
        topFailureReasons,
      },
      matching: {
        totalCurrentlyMatched: currentMatches.length,
        averageScore,
        sampleSize: scores.length,
      },
      campaigns: {
        total: allCampaigns.length,
        byStatus: countBy(allCampaigns, (c) => c.status),
        totalShortlistEntries: allCampaignCreators.length,
        byShortlistStatus: countBy(allCampaignCreators, (c) => c.status),
      },
      outreach: {
        totalDrafts: allDrafts.length,
        byDraftStatus: countBy(allDrafts, (d) => d.status),
        byApprovalStatus: countBy(allApprovals, (a) => a.status),
      },
      sends: {
        total: allSends.length,
        byStatus: countBy(allSends, (s) => s.status),
      },
      replies: {
        total: allMessages.length,
        byMatchStatus: countBy(allMessages, (m) => m.matchStatus),
        byClassification: countBy(
          allMessages.filter((m) => m.classification !== null),
          (m) => m.classification as string
        ),
        suggestedResponsesDrafted,
      },
      crm: {
        byRelationshipStatus: countBy(allRelationships, (r) => r.status),
        openTasks: allTasks.filter((t) => t.status === "open").length,
        totalTasks: allTasks.length,
        totalNotes: allNotes.length,
      },
      whop: {
        affiliates: { total: allAffiliates.length, byStatus: countBy(allAffiliates, (a) => a.status) },
        conversions: {
          total: allConversions.length,
          byEventType: countBy(allConversions, (c) => c.eventType),
          revenueByCurrency: [...revenueByCurrency.entries()].map(([currency, total]) => ({ currency, total })),
        },
      },
      generatedAt: new Date().toISOString(),
    };
  });
}

export interface CampaignAnalyticsSummary {
  campaignId: string;
  shortlist: { total: number; byStatus: Record<string, number> };
  qualification: { totalCurrentlyEvaluated: number; passed: number; failed: number };
  matching: { totalCurrentlyMatched: number; averageScore: number | null; sampleSize: number };
  outreach: { totalDrafts: number; byDraftStatus: Record<string, number>; byApprovalStatus: Record<string, number> };
  sends: { total: number; byStatus: Record<string, number> };
  replies: { total: number; byMatchStatus: Record<string, number>; byClassification: Record<string, number> };
  generatedAt: string;
}

/** Per-campaign rollup -- the same real-data-only principle, scoped to one campaign. */
export async function getCampaignAnalytics(params: {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}): Promise<CampaignAnalyticsSummary> {
  const { workspaceId, actorUserId, campaignId } = params;

  return withWorkspace(workspaceId, async (tx) => {
    await requireActorRole(tx, actorUserId, "member_operator");

    const [shortlist, qualifications, matches, drafts, sends, messages] = await Promise.all([
      tx.select().from(campaignCreators).where(eq(campaignCreators.campaignId, campaignId)),
      tx.select().from(creatorQualifications).where(eq(creatorQualifications.campaignId, campaignId)),
      tx.select().from(creatorMatches).where(eq(creatorMatches.campaignId, campaignId)),
      tx.select().from(outreachDrafts).where(eq(outreachDrafts.campaignId, campaignId)),
      tx.select().from(outreachSends).where(eq(outreachSends.campaignId, campaignId)),
      tx.select().from(inboundMessages).where(eq(inboundMessages.campaignId, campaignId)),
    ]);

    const relevantApprovals = await tx.select().from(approvals).where(eq(approvals.campaignId, campaignId));

    const currentQualifications = latestPerGroup(
      qualifications,
      (q) => q.creatorId,
      (q) => q.evaluatedAt
    );
    const currentMatches = latestPerGroup(
      matches,
      (m) => m.creatorId,
      (m) => m.computedAt
    );
    const scores = currentMatches.map((m) => Number(m.score)).filter((s) => Number.isFinite(s));

    return {
      campaignId,
      shortlist: { total: shortlist.length, byStatus: countBy(shortlist, (s) => s.status) },
      qualification: {
        totalCurrentlyEvaluated: currentQualifications.length,
        passed: currentQualifications.filter((q) => q.passed).length,
        failed: currentQualifications.filter((q) => !q.passed).length,
      },
      matching: {
        totalCurrentlyMatched: currentMatches.length,
        averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
        sampleSize: scores.length,
      },
      outreach: {
        totalDrafts: drafts.length,
        byDraftStatus: countBy(drafts, (d) => d.status),
        byApprovalStatus: countBy(relevantApprovals, (a) => a.status),
      },
      sends: { total: sends.length, byStatus: countBy(sends, (s) => s.status) },
      replies: {
        total: messages.length,
        byMatchStatus: countBy(messages, (m) => m.matchStatus),
        byClassification: countBy(
          messages.filter((m) => m.classification !== null),
          (m) => m.classification as string
        ),
      },
      generatedAt: new Date().toISOString(),
    };
  });
}
