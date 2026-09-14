import { QUEUE_LANES } from "@rdv/queue";
import { runAiOperation } from "@rdv/ai";
import type { PersonalizeOutreachInput, PersonalizeOutreachOutput } from "@rdv/ai";
import {
  getCampaign,
  getProduct,
  getCreator,
  getApprovedProductIntelligence,
  resolveTemplateForCampaign,
  persistOutreachDraft,
} from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 2 Phase 6 (plan §11): the `ai_personalize_outreach` job — drafts
 * one personalized outreach message for one creator on one campaign.
 * Never sends, never approves — this job's only effect is inserting a
 * `draft` row; a human decides everything after this point. Reads
 * everything through @rdv/domain functions, same layering as Phase 5's
 * matching worker.
 */
export interface OutreachDraftJobData {
  workspaceId: string;
  actorUserId: string;
  campaignId: string;
  creatorId: string;
  templateId: string | null;
}

registerJobProcessor<OutreachDraftJobData, { draftId: string }>(
  QUEUE_LANES.aiOps,
  "ai_personalize_outreach",
  async (data) => {
    const { workspaceId, actorUserId, campaignId, creatorId, templateId } = data;

    const campaign = await getCampaign({ workspaceId, actorUserId, campaignId });
    const product = await getProduct({ workspaceId, actorUserId, productId: campaign.productId });
    const approvedIntelligence = await getApprovedProductIntelligence({ workspaceId, productId: product.id });
    const creator = await getCreator({ workspaceId, actorUserId, creatorId });
    const template = await resolveTemplateForCampaign({ workspaceId, campaignId, explicitTemplateId: templateId });

    const input: PersonalizeOutreachInput = {
      workspaceId,
      productName: product.name,
      productAudienceRationale: approvedIntelligence?.audienceRationale ?? null,
      campaignObjective: campaign.objective,
      creatorName: creator.displayName ?? creator.id,
      creatorNiche: creator.niche,
      templateSubject: template?.subject ?? null,
      templateBody: template?.body ?? null,
    };

    const result = await runAiOperation<PersonalizeOutreachInput, PersonalizeOutreachOutput>(
      "personalize_outreach",
      input,
      { workspaceId, actorUserId }
    );

    const draft = await persistOutreachDraft({
      workspaceId,
      campaignId,
      creatorId,
      templateId: template?.id ?? null,
      subject: result.data.subject,
      body: result.data.body,
      generationInput: { ...input },
    });

    return { draftId: draft.id };
  }
);
