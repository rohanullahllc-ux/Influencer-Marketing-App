import { QUEUE_LANES } from "@rdv/queue";
import { runAiOperation } from "@rdv/ai";
import type { ClassifyReplyInput, ClassifyReplyOutput, DraftReplyResponseInput, DraftReplyResponseOutput } from "@rdv/ai";
import { getInboundMessage, getOutreachSend, getApproval, getCreator, persistOutreachDraft, persistReplyClassification } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 3 (Reply Intelligence): the `reply_classify_and_suggest` job —
 * classifies a real inbound reply, and (only for interested/
 * needs_human_review, only when matched to a real creator+campaign)
 * drafts a suggested response as an ordinary outreach draft. Never sends
 * anything; a human must still approve any suggested draft through the
 * exact same pipeline as any other outreach. Reads everything through
 * @rdv/domain functions, same layering as Phase 5/6's own AI workers.
 */
export interface ReplyIntelligenceJobData {
  workspaceId: string;
  actorUserId: string;
  inboundMessageId: string;
}

registerJobProcessor<ReplyIntelligenceJobData, { classification: string; suggestedDraftId: string | null }>(
  QUEUE_LANES.aiOps,
  "reply_classify_and_suggest",
  async (data) => {
    const { workspaceId, actorUserId, inboundMessageId } = data;

    const message = await getInboundMessage({ workspaceId, actorUserId, inboundMessageId });

    let originalSubject: string | null = null;
    let originalBody: string | null = null;
    let creatorName: string | null = null;

    if (message.outreachSendId) {
      const send = await getOutreachSend({ workspaceId, actorUserId, outreachSendId: message.outreachSendId });
      const approval = await getApproval({ workspaceId, actorUserId, approvalId: send.approvalId });
      originalSubject = approval.exactSubject;
      originalBody = approval.exactBody;
    }
    if (message.creatorId) {
      const creator = await getCreator({ workspaceId, actorUserId, creatorId: message.creatorId });
      creatorName = creator.displayName;
    }

    const classifyResult = await runAiOperation<ClassifyReplyInput, ClassifyReplyOutput>(
      "classify_reply",
      { workspaceId, originalSubject, originalBody, replySubject: message.subject, replyBody: message.body },
      { workspaceId, actorUserId }
    );
    const { classification, confidence, limitations, extractedFacts } = classifyResult.data;

    let suggestedDraftId: string | null = null;
    const canDraftSuggestion = classification !== "not_interested" && message.campaignId && message.creatorId;

    if (canDraftSuggestion) {
      const draftResult = await runAiOperation<DraftReplyResponseInput, DraftReplyResponseOutput>(
        "draft_reply_response",
        {
          workspaceId,
          creatorName,
          originalSubject,
          originalBody,
          replyBody: message.body,
          classification: classification as "interested" | "needs_human_review",
        },
        { workspaceId, actorUserId }
      );

      const draft = await persistOutreachDraft({
        workspaceId,
        campaignId: message.campaignId!,
        creatorId: message.creatorId!,
        templateId: null,
        subject: draftResult.data.subject,
        body: draftResult.data.body,
        generationInput: { inReplyToInboundMessageId: message.id },
        inReplyToInboundMessageId: message.id,
      });
      suggestedDraftId = draft.id;
    }

    await persistReplyClassification({
      workspaceId,
      actorUserId,
      inboundMessageId,
      classification,
      confidence,
      limitations,
      extractedFacts,
      suggestedDraftId,
    });

    return { classification, suggestedDraftId };
  }
);
