import { z } from "zod";
import { ValidationError } from "@rdv/lib";
import { isAiMockModeEnabled } from "@rdv/auth";
import { registerAiOperation } from "../orchestrator.js";
import { runDeepSeekJsonCompletion } from "../client.js";
import { mockPersonalizeOutreach } from "../mock.js";

/**
 * Wave 2 Phase 6 (plan §11, §18): drafts a personalized outreach message
 * for one creator. Output is a draft only — never sent, never approved
 * by this operation or any AI path (the Wave 1 hard-restriction list
 * already refuses to register any operation whose name contains "send"
 * or "approve"; human approval in packages/domain/src/approvals.ts is
 * the only path that can mark a message approved). Structured output via
 * DeepSeek's JSON mode + Zod validation (see ../client.js), same pattern
 * as analyzeProduct.ts and explainCreatorMatch.ts.
 */
const PersonalizeOutreachOutputSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export type PersonalizeOutreachOutput = z.infer<typeof PersonalizeOutreachOutputSchema>;

export interface PersonalizeOutreachInput {
  workspaceId: string;
  productName: string;
  productAudienceRationale: string | null;
  campaignObjective: string | null;
  creatorName: string;
  creatorNiche: string | null;
  templateSubject: string | null;
  templateBody: string | null;
}

const SYSTEM_PROMPT = `You are a creator-outreach copywriter drafting a single personalized cold-outreach email from a brand to one content creator. Use the given product, campaign objective, and creator profile to personalize the provided template (if any) — or write a short, genuine, non-generic email from scratch if no template is given. Return a strict JSON object with exactly two fields: subject (string) and body (string, plain text, no HTML). The email must be honest and specific to the creator — never invent facts about the creator, the product, or any commercial terms (pricing, compensation, deadlines) that were not provided. This is a draft only: it will be reviewed and explicitly approved by a human before anything is sent — never write as if the message has already been sent or approved. Respond with only the JSON object, no other text.`;

registerAiOperation<PersonalizeOutreachInput, PersonalizeOutreachOutput>("personalize_outreach", async (input) => {
  if (!input.creatorName || input.creatorName.trim().length === 0) {
    throw new ValidationError("creatorName is required to personalize outreach");
  }

  if (await isAiMockModeEnabled(input.workspaceId)) {
    return mockPersonalizeOutreach(input);
  }

  const user = [
    `Product: ${input.productName}`,
    `Product target audience rationale: ${input.productAudienceRationale ?? "(none provided)"}`,
    `Campaign objective: ${input.campaignObjective ?? "(none provided)"}`,
    `Creator name: ${input.creatorName}`,
    `Creator niche: ${input.creatorNiche ?? "(unknown)"}`,
    `Template subject (personalize this, or write your own if empty): ${input.templateSubject ?? "(none)"}`,
    `Template body (personalize this, or write your own if empty): ${input.templateBody ?? "(none)"}`,
  ].join("\n");

  return runDeepSeekJsonCompletion({
    workspaceId: input.workspaceId,
    operationName: "personalize_outreach",
    system: SYSTEM_PROMPT,
    user,
    schema: PersonalizeOutreachOutputSchema,
    maxTokens: 2048,
  });
});
