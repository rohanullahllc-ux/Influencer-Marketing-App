import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { getWorkspaceAnthropicClient } from "../client.js";
import { mockAnalyzeProduct } from "../mock.js";

/**
 * Wave 2 Phase 2 (plan §7, §14.2, §18): the first real product AI
 * operation, replacing/joining the Wave 1 stub. Registered exactly like
 * stub.ts — self-registers on import, no dynamic/free-form call path.
 *
 * Output is constrained via the Anthropic SDK's own structured-output
 * support (`output_config.format` + `messages.parse()`, Zod schema) —
 * this *is* the "strict schema validation before persisting" the plan
 * requires (§7 risks, §18): a response that doesn't match the schema
 * comes back as `parsed_output: null`, which this operation turns into a
 * thrown error, failing the job loudly rather than partially saving
 * (matches the Step 6 failure philosophy already used elsewhere).
 */
const AnalyzeProductOutputSchema = z.object({
  idealCustomer: z.array(z.string()),
  problems: z.array(z.string()),
  benefits: z.array(z.string()),
  niches: z.array(z.string()),
  subNiches: z.array(z.string()),
  creatorTypes: z.array(z.string()),
  countries: z.array(z.string()),
  languages: z.array(z.string()),
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
  audienceRationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type AnalyzeProductOutput = z.infer<typeof AnalyzeProductOutputSchema>;

export interface AnalyzeProductInput {
  workspaceId: string;
  productName: string;
  productDescription: string | null;
}

const SYSTEM_PROMPT = `You are a market research analyst preparing creator-marketing intelligence for a product. Given a product's name and description, analyze it and return: the ideal customer profile, the problems it solves, its key benefits, the niches and sub-niches it fits, the types of content creators best suited to promote it, likely target countries and languages, relevant topics and search keywords, a short rationale for the target audience, and a confidence score (0 to 1) reflecting how certain this analysis is given the information provided. Base the analysis only on the given product name and description — do not invent specifics (pricing, company details, competitors) that were not provided.`;

registerAiOperation<AnalyzeProductInput, AnalyzeProductOutput>("analyze_product", async (input) => {
  if (!input.productName || input.productName.trim().length === 0) {
    throw new ValidationError("productName is required to analyze a product");
  }

  if (await isAiMockModeEnabled(input.workspaceId)) {
    return mockAnalyzeProduct(input);
  }

  const client = await getWorkspaceAnthropicClient(input.workspaceId);

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Product name: ${input.productName}\nProduct description: ${
          input.productDescription && input.productDescription.trim().length > 0
            ? input.productDescription
            : "(none provided)"
        }`,
      },
    ],
    output_config: { format: zodOutputFormat(AnalyzeProductOutputSchema) },
  });

  if (!response.parsed_output) {
    throw new ValidationError(
      "analyze_product: Claude's response did not match the required output schema — failing rather than partially saving"
    );
  }

  return response.parsed_output;
});
