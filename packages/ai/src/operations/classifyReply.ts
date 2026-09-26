import { z } from "zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { runDeepSeekJsonCompletion } from "../client.js";
import { mockClassifyReply } from "../mock.js";

/**
 * Wave 3 (Reply Intelligence): classifies an inbound reply into exactly
 * the three product-vision categories — never a free-form label, never a
 * numeric-only score standing in for a decision. AI classifies and
 * summarizes; it never decides what happens next (that is always a human,
 * via the reply inbox UI) and never drafts anything that gets sent
 * without a human approving it through the exact same approval pipeline
 * every other outreach message goes through.
 */
const ClassifyReplyOutputSchema = z.object({
  classification: z.enum(["interested", "not_interested", "needs_human_review"]),
  confidence: z.number().min(0).max(1),
  limitations: z.string().nullable(),
  extractedFacts: z.array(z.string()),
});

export type ClassifyReplyOutput = z.infer<typeof ClassifyReplyOutputSchema>;

export interface ClassifyReplyInput {
  workspaceId: string;
  originalSubject: string | null;
  originalBody: string | null;
  replySubject: string | null;
  replyBody: string;
}

const SYSTEM_PROMPT = `You are classifying a creator's reply to an outreach email about a paid partnership/affiliate opportunity. Given the original outreach message (if known) and the creator's reply, return strict JSON with: classification (exactly one of "interested", "not_interested", "needs_human_review" -- use needs_human_review whenever the reply is ambiguous, asks a question you cannot answer with certainty, raises a condition/negotiation, or does not clearly fall into the other two), confidence (0 to 1), limitations (a string describing what made this hard to classify, or null if nothing did), and extractedFacts (an array of short factual strings actually stated in the reply -- e.g. rates mentioned, availability dates, questions asked -- never invented). When genuinely uncertain, prefer needs_human_review over guessing. Respond with only the JSON object, no other text.`;

registerAiOperation<ClassifyReplyInput, ClassifyReplyOutput>("classify_reply", async (input) => {
  if (!input.replyBody || input.replyBody.trim().length === 0) {
    throw new ValidationError("replyBody is required to classify a reply");
  }

  if (await isAiMockModeEnabled(input.workspaceId)) {
    return mockClassifyReply();
  }

  const user = [
    `Original outreach subject: ${input.originalSubject ?? "(unknown)"}`,
    `Original outreach body: ${input.originalBody ?? "(unknown)"}`,
    `Reply subject: ${input.replySubject ?? "(none)"}`,
    `Reply body: ${input.replyBody}`,
  ].join("\n\n");

  return runDeepSeekJsonCompletion({
    workspaceId: input.workspaceId,
    operationName: "classify_reply",
    system: SYSTEM_PROMPT,
    user,
    schema: ClassifyReplyOutputSchema,
    maxTokens: 1024,
  });
});
