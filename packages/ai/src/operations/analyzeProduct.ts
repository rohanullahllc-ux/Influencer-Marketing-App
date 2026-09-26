import { z } from "zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { runDeepSeekJsonCompletion } from "../client.js";
import { mockAnalyzeProduct } from "../mock.js";

/**
 * Wave 2 Phase 2 (plan §7, §14.2, §18): the first real product AI
 * operation, replacing/joining the Wave 1 stub. Registered exactly like
 * stub.ts — self-registers on import, no dynamic/free-form call path.
 *
 * Output is constrained via DeepSeek's OpenAI-compatible JSON mode plus
 * strict Zod validation (see `runDeepSeekJsonCompletion` in ../client.js)
 * — this *is* the "strict schema validation before persisting" the plan
 * requires (§7 risks, §18): a response that doesn't match the schema
 * fails loudly rather than partially saving (matches the Step 6 failure
 * philosophy already used elsewhere).
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

const SYSTEM_PROMPT = `You are a market research analyst preparing creator-marketing intelligence for a product. Given a product's name and description, analyze it and return a strict JSON object with: idealCustomer (array of strings), problems (array of strings, problems it solves), benefits (array of strings), niches (array of strings), subNiches (array of strings), creatorTypes (array of strings — types of content creators best suited to promote it), countries (array of strings, likely target countries), languages (array of strings), topics (array of strings), keywords (array of strings, search keywords), audienceRationale (string, a short rationale for the target audience), and confidence (a number from 0 to 1 reflecting how certain this analysis is given the information provided). Base the analysis only on the given product name and description — do not invent specifics (pricing, company details, competitors) that were not provided. Respond with only the JSON object, no other text.`;

registerAiOperation<AnalyzeProductInput, AnalyzeProductOutput>("analyze_product", async (input) => {
  if (!input.productName || input.productName.trim().length === 0) {
    throw new ValidationError("productName is required to analyze a product");
  }

  if (await isAiMockModeEnabled(input.workspaceId)) {
    return mockAnalyzeProduct(input);
  }

  return runDeepSeekJsonCompletion({
    workspaceId: input.workspaceId,
    operationName: "analyze_product",
    system: SYSTEM_PROMPT,
    user: `Product name: ${input.productName}\nProduct description: ${
      input.productDescription && input.productDescription.trim().length > 0
        ? input.productDescription
        : "(none provided)"
    }`,
    schema: AnalyzeProductOutputSchema,
    maxTokens: 4096,
  });
});
