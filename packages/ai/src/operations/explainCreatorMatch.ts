import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ValidationError } from "@rdv/lib";
import { registerAiOperation } from "../orchestrator.js";
import { getWorkspaceAnthropicClient } from "../client.js";

/**
 * Wave 2 Phase 5 (plan §10, §18): explains, but never decides, whether a
 * creator fits a campaign. This is explicitly a second, independent
 * signal alongside the deterministic qualification engine
 * (packages/domain/src/qualification.ts) — never a replacement for it;
 * qualification pass/fail never depends on this operation's output.
 * Structured output via the SDK's own Zod support, same as
 * analyzeProduct.ts: a response that doesn't match the schema fails
 * loudly rather than partially saving.
 */
const ExplainCreatorMatchOutputSchema = z.object({
  score: z.number().min(0).max(1),
  explanation: z.string().min(1),
  factors: z.array(z.string()),
  limitations: z.string().nullable(),
});

export type ExplainCreatorMatchOutput = z.infer<typeof ExplainCreatorMatchOutputSchema>;

export interface ExplainCreatorMatchInput {
  workspaceId: string;
  campaignObjective: string | null;
  campaignNiches: string[];
  productName: string;
  productAudienceRationale: string | null;
  creatorName: string;
  creatorNiche: string | null;
  creatorSubNiche: string | null;
  creatorSubscriberCount: number | null;
  creatorCountry: string | null;
}

const SYSTEM_PROMPT = `You are a creator-marketing analyst explaining how well a specific creator fits a specific campaign. Given the campaign's objective and target niches, the product's target audience, and the creator's profile, return a strict JSON object with: score (0 to 1, how well this creator fits), explanation (a few sentences a human can read to decide whether to approve outreach), factors (an array of short strings — the specific signals that drove the score), and limitations (a string describing what data was missing or uncertain, or null if none). Base your answer only on the given information — never invent facts about the creator or campaign that were not provided.`;

registerAiOperation<ExplainCreatorMatchInput, ExplainCreatorMatchOutput>("explain_creator_match", async (input) => {
  if (!input.creatorName || input.creatorName.trim().length === 0) {
    throw new ValidationError("creatorName is required to explain a creator match");
  }

  const client = await getWorkspaceAnthropicClient(input.workspaceId);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Campaign objective: ${input.campaignObjective ?? "(none provided)"}`,
          `Campaign target niches: ${input.campaignNiches.length > 0 ? input.campaignNiches.join(", ") : "(none provided)"}`,
          `Product: ${input.productName}`,
          `Product target audience rationale: ${input.productAudienceRationale ?? "(none provided)"}`,
          `Creator name: ${input.creatorName}`,
          `Creator niche: ${input.creatorNiche ?? "(unknown)"}`,
          `Creator sub-niche: ${input.creatorSubNiche ?? "(unknown)"}`,
          `Creator subscriber count: ${input.creatorSubscriberCount ?? "(unknown)"}`,
          `Creator country: ${input.creatorCountry ?? "(unknown)"}`,
        ].join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(ExplainCreatorMatchOutputSchema) },
  });

  if (!response.parsed_output) {
    throw new ValidationError(
      "explain_creator_match: Claude's response did not match the required output schema — failing rather than partially saving"
    );
  }

  return response.parsed_output;
});
