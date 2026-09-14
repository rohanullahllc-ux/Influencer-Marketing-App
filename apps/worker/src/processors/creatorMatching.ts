import { QUEUE_LANES } from "@rdv/queue";
import { runAiOperation } from "@rdv/ai";
import type { ExplainCreatorMatchInput, ExplainCreatorMatchOutput } from "@rdv/ai";
import {
  getCampaign,
  getProduct,
  getCreator,
  listCampaignCreators,
  persistCreatorMatch,
  getApprovedProductIntelligence,
} from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 2 Phase 5 (plan §10): the `ai_explain_match` job — runs the
 * explain_creator_match AI operation for every shortlisted creator on a
 * campaign and persists an append-only creator_matches row per creator.
 * Fails loudly on any error (including "no Anthropic key configured"),
 * never silently skipping a creator. Reads everything through @rdv/domain
 * functions, never @rdv/db's schema directly — same layering as
 * analyzeProduct.ts (Phase 2) and creatorDiscovery.ts (Phase 3).
 */
export interface CreatorMatchingJobData {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
}

registerJobProcessor<CreatorMatchingJobData, { matchIds: string[]; count: number }>(
  QUEUE_LANES.aiOps,
  "ai_explain_match",
  async (data) => {
    const { workspaceId, actorUserId, campaignId } = data;

    const campaign = await getCampaign({ workspaceId, actorUserId, campaignId });
    const product = await getProduct({ workspaceId, actorUserId, productId: campaign.productId });
    const approvedIntelligence = await getApprovedProductIntelligence({ workspaceId, productId: product.id });

    const shortlist = await listCampaignCreators({ workspaceId, actorUserId, campaignId });

    const matchIds: string[] = [];
    for (const entry of shortlist) {
      const creator = await getCreator({ workspaceId, actorUserId, creatorId: entry.creatorId });

      const result = await runAiOperation<ExplainCreatorMatchInput, ExplainCreatorMatchOutput>(
        "explain_creator_match",
        {
          workspaceId,
          campaignObjective: campaign.objective,
          campaignNiches: (campaign.nicheRequirements as string[] | null) ?? [],
          productName: product.name,
          productAudienceRationale: approvedIntelligence?.audienceRationale ?? null,
          creatorName: creator.displayName ?? creator.id,
          creatorNiche: creator.niche,
          creatorSubNiche: creator.subNiche,
          creatorSubscriberCount: creator.subscriberCount,
          creatorCountry: creator.country,
        },
        { workspaceId, actorUserId }
      );

      const saved = await persistCreatorMatch({
        workspaceId,
        campaignId,
        creatorId: creator.id,
        data: result.data,
      });
      matchIds.push(saved.id);
    }

    return { matchIds, count: matchIds.length };
  }
);
