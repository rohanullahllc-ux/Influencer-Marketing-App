import { QUEUE_LANES } from "@rdv/queue";
import { runAiOperation } from "@rdv/ai";
import type { SummarizeCreatorConversationInput, SummarizeCreatorConversationOutput } from "@rdv/ai";
import { getCreator, getCreatorHistory, persistCreatorConversationSummary } from "@rdv/domain";
import { registerJobProcessor } from "../registry.js";

/**
 * Wave 4 (Creator CRM): the `summarize_creator_conversation` job — reads
 * the real outreach/reply history for a creator (Wave 3's outreach_sends/
 * inbound_messages, via getCreatorHistory — never a CRM-only copy) and
 * asks the AI operation to summarize it. Read-only: never changes
 * relationship status, never drafts or sends anything. Same layering as
 * every other AI-backed worker in this build: the AI call lives here, not
 * in packages/domain.
 */
export interface CreatorConversationSummaryJobData {
  workspaceId: string;
  actorUserId: string;
  creatorId: string;
  campaignId?: string | null;
}

registerJobProcessor<CreatorConversationSummaryJobData, { summaryId: string }>(
  QUEUE_LANES.aiOps,
  "summarize_creator_conversation",
  async (data) => {
    const { workspaceId, actorUserId, creatorId, campaignId = null } = data;

    const creator = await getCreator({ workspaceId, actorUserId, creatorId });
    const history = await getCreatorHistory({ workspaceId, actorUserId, creatorId });

    const outbound = history.outreachSends
      .filter((s) => s.status === "sent" && s.sentAt)
      .map((s) => ({
        direction: "outbound" as const,
        occurredAt: s.sentAt!.toISOString(),
        subject: null,
        body: `(outreach step: ${s.outreachStep})`,
      }));
    const inbound = history.inboundMessages.map((m) => ({
      direction: "inbound" as const,
      occurredAt: m.receivedAt.toISOString(),
      subject: m.subject,
      body: m.body,
    }));

    const thread = [...outbound, ...inbound].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    const result = await runAiOperation<SummarizeCreatorConversationInput, SummarizeCreatorConversationOutput>(
      "summarize_creator_conversation",
      { workspaceId, creatorName: creator.displayName, thread },
      { workspaceId, actorUserId }
    );

    const summary = await persistCreatorConversationSummary({
      workspaceId,
      actorUserId,
      creatorId,
      campaignId,
      summary: result.data.summary,
      keyPoints: result.data.keyPoints,
      basedOnMessageCount: thread.length,
    });

    return { summaryId: summary.id };
  }
);
