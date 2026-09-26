import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { getWorkspaceAnthropicClient } from "../client.js";
import { mockDraftReplyResponse } from "../mock.js";

/**
 * Wave 3 (Reply Intelligence): drafts a suggested response to a creator's
 * reply. AI may draft; AI may never send. The output of this operation is
 * persisted as an ordinary `outreach_drafts` row (see
 * packages/domain/src/replies.ts) that must go through the exact same
 * human-approval + safety-gate + send pipeline as any other outreach
 * message — there is no path from this operation's output to an outbound
 * message that skips a human decision.
 */
const DraftReplyResponseOutputSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type DraftReplyResponseOutput = z.infer<typeof DraftReplyResponseOutputSchema>;

export interface DraftReplyResponseInput {
  workspaceId: string;
  creatorName: string | null;
  originalSubject: string | null;
  originalBody: string | null;
  replyBody: string;
  classification: "interested" | "needs_human_review";
}

const SYSTEM_PROMPT = `You are drafting a suggested follow-up email reply on behalf of a founder running influencer partnership outreach. Given the original outreach message and the creator's reply, draft a warm, concise, professional follow-up that moves the conversation forward appropriately for the given classification (if "interested", move toward next steps; if "needs_human_review", ask a clarifying question or acknowledge and note a human will follow up with specifics). Return strict JSON with subject and body. Never invent commitments, rates, dates, or facts not already present in the conversation. This draft will always be reviewed and edited by a human before anything is sent -- write it as a strong starting point, not a final answer.`;

registerAiOperation<DraftReplyResponseInput, DraftReplyResponseOutput>("draft_reply_response", async (input) => {
  if (!input.replyBody || input.replyBody.trim().length === 0) {
    throw new ValidationError("replyBody is required to draft a reply response");
  }

  if (await isAiMockModeEnabled(input.workspaceId)) {
    return mockDraftReplyResponse(input);
  }

  const client = await getWorkspaceAnthropicClient(input.workspaceId);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Creator name: ${input.creatorName ?? "(unknown)"}`,
          `Original outreach subject: ${input.originalSubject ?? "(unknown)"}`,
          `Original outreach body: ${input.originalBody ?? "(unknown)"}`,
          `Creator's reply: ${input.replyBody}`,
          `Classification: ${input.classification}`,
        ].join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(DraftReplyResponseOutputSchema) },
  });

  if (!response.parsed_output) {
    throw new ValidationError(
      "draft_reply_response: Claude's response did not match the required output schema — failing rather than partially saving"
    );
  }

  return response.parsed_output;
});
