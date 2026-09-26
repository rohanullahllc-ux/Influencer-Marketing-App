import { z } from "zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { runDeepSeekJsonCompletion } from "../client.js";
import { mockSummarizeCreatorConversation } from "../mock.js";

/**
 * Wave 4 (Creator CRM, product vision §"AI conversation summaries"):
 * summarizes the real outreach/reply history with a creator into a short,
 * human-readable summary plus a handful of concrete key points — never
 * fabricated, always grounded in the actual message thread passed in.
 * This is read-only: it never changes relationship status, never drafts
 * a message, never takes any action — a human decides what to do with
 * the summary.
 */
const SummarizeCreatorConversationOutputSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  limitations: z.string().nullable(),
});

export type SummarizeCreatorConversationOutput = z.infer<typeof SummarizeCreatorConversationOutputSchema>;

export interface SummarizeCreatorConversationInput {
  workspaceId: string;
  creatorName: string | null;
  thread: Array<{ direction: "outbound" | "inbound"; occurredAt: string; subject: string | null; body: string }>;
}

const SYSTEM_PROMPT = `You are summarizing the real email conversation history between a brand and a creator being considered for a paid partnership/affiliate opportunity. You are given the actual outbound messages sent and actual inbound replies received, in order. Return strict JSON with: summary (a short, neutral, factual summary of the conversation's current state -- 2-4 sentences), keyPoints (an array of short factual statements actually present in the thread -- e.g. rates discussed, availability, objections raised, questions still open -- never invented or inferred beyond what was actually said), and limitations (a string describing anything that makes this summary incomplete or uncertain, e.g. a short thread or an unanswered question, or null if nothing does). Never invent facts not present in the provided thread. Respond with only the JSON object, no other text.`;

registerAiOperation<SummarizeCreatorConversationInput, SummarizeCreatorConversationOutput>(
  "summarize_creator_conversation",
  async (input) => {
    if (!input.thread || input.thread.length === 0) {
      throw new ValidationError("summarize_creator_conversation: no conversation history was provided to summarize");
    }

    if (await isAiMockModeEnabled(input.workspaceId)) {
      return mockSummarizeCreatorConversation(input);
    }

    const threadText = input.thread
      .map((m) => `[${m.direction.toUpperCase()} ${m.occurredAt}] Subject: ${m.subject ?? "(none)"}\n${m.body}`)
      .join("\n\n---\n\n");

    const user = [`Creator: ${input.creatorName ?? "(unknown name)"}`, `Conversation thread:\n\n${threadText}`].join(
      "\n\n"
    );

    return runDeepSeekJsonCompletion({
      workspaceId: input.workspaceId,
      operationName: "summarize_creator_conversation",
      system: SYSTEM_PROMPT,
      user,
      schema: SummarizeCreatorConversationOutputSchema,
      maxTokens: 1024,
    });
  }
);
