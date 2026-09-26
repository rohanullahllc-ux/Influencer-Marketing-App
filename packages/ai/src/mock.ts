import type { AnalyzeProductInput, AnalyzeProductOutput } from "./operations/analyzeProduct.js";
import type { ExplainCreatorMatchInput, ExplainCreatorMatchOutput } from "./operations/explainCreatorMatch.js";
import type { PersonalizeOutreachInput, PersonalizeOutreachOutput } from "./operations/personalizeOutreach.js";
import type { ClassifyReplyOutput } from "./operations/classifyReply.js";
import type { DraftReplyResponseInput, DraftReplyResponseOutput } from "./operations/draftReplyResponse.js";
import type {
  SummarizeCreatorConversationInput,
  SummarizeCreatorConversationOutput,
} from "./operations/summarizeCreatorConversation.js";

/**
 * Mock AI provider (opt-in, packages/auth's `isAiMockModeEnabled`). One
 * builder per real operation, matching that operation's exact Zod output
 * schema, so a caller cannot tell from shape alone whether it got a real
 * or mock result — only from content, which is why every field here is
 * unambiguously prefixed "[MOCK...]" rather than left to look plausible.
 *
 * Deliberately conservative where a real operation would need judgment:
 * `mockClassifyReply` always returns `needs_human_review` (never
 * `interested`) and every numeric score/confidence is fixed low (0.3),
 * signaling "do not rely on this" the same way the app already flags
 * small-sample real data elsewhere. No network calls, no randomness beyond
 * simple deterministic derivation from the input, so results are stable
 * and testable.
 */

const MOCK_NOTE =
  "This is placeholder output from Mock AI mode (Settings > Integrations) — not a real analysis. Turn off Mock AI mode and add a real DeepSeek key for genuine output.";

function deriveKeywords(text: string, limit: number): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return [...new Set(words)].slice(0, limit);
}

export function mockAnalyzeProduct(input: AnalyzeProductInput): AnalyzeProductOutput {
  const sourceText = `${input.productName} ${input.productDescription ?? ""}`.trim();
  const keywords = deriveKeywords(sourceText, 6);
  const topic = keywords[0] ?? "general";

  return {
    idealCustomer: [`[MOCK] People interested in ${topic}`],
    problems: [`[MOCK] A problem related to ${topic}`],
    benefits: [`[MOCK] A benefit related to ${topic}`],
    niches: keywords.slice(0, 3).length > 0 ? keywords.slice(0, 3) : ["general"],
    subNiches: keywords.slice(3, 5),
    creatorTypes: ["[MOCK] micro-influencer", "[MOCK] niche content creator"],
    countries: ["US"],
    languages: ["en"],
    topics: keywords,
    keywords,
    audienceRationale: `[MOCK — no real AI analysis performed] ${MOCK_NOTE}`,
    confidence: 0.3,
  };
}

export function mockExplainCreatorMatch(input: ExplainCreatorMatchInput): ExplainCreatorMatchOutput {
  const hasProfile = Boolean(input.creatorNiche || input.creatorSubscriberCount);
  return {
    score: hasProfile ? 0.5 : 0.3,
    explanation: `[MOCK] Placeholder match explanation for ${input.creatorName}. ${MOCK_NOTE}`,
    factors: ["[MOCK] Mock AI mode is on — this is not a real signal"],
    limitations: `[MOCK DATA] ${MOCK_NOTE}`,
  };
}

export function mockPersonalizeOutreach(input: PersonalizeOutreachInput): PersonalizeOutreachOutput {
  const subject = input.templateSubject
    ? `[MOCK DRAFT] ${input.templateSubject}`
    : `[MOCK DRAFT] Partnership opportunity with ${input.productName}`;
  const body = [
    `[This is a MOCK draft — Mock AI mode is on for this workspace. ${MOCK_NOTE}]`,
    "",
    `Hi ${input.creatorName},`,
    "",
    input.templateBody
      ? `(placeholder personalization of your template) ${input.templateBody}`
      : `We'd love to explore a partnership around ${input.productName}. This message is a mock placeholder, not real AI-generated copy.`,
  ].join("\n");

  return { subject, body };
}

export function mockClassifyReply(): ClassifyReplyOutput {
  return {
    classification: "needs_human_review",
    confidence: 0.3,
    limitations: `[MOCK DATA] ${MOCK_NOTE} Defaulting to needs_human_review rather than guessing.`,
    extractedFacts: [],
  };
}

export function mockDraftReplyResponse(input: DraftReplyResponseInput): DraftReplyResponseOutput {
  return {
    subject: `[MOCK DRAFT] Re: your message`,
    body: [
      `[This is a MOCK reply draft — Mock AI mode is on for this workspace. ${MOCK_NOTE}]`,
      "",
      `Hi ${input.creatorName ?? "there"}, thanks for your reply — a member of our team will follow up with specifics shortly.`,
    ].join("\n"),
  };
}

export function mockSummarizeCreatorConversation(
  input: SummarizeCreatorConversationInput
): SummarizeCreatorConversationOutput {
  return {
    summary: `[MOCK] Placeholder summary of ${input.thread.length} real message(s) with ${
      input.creatorName ?? "this creator"
    }. ${MOCK_NOTE}`,
    keyPoints: [],
    limitations: `[MOCK DATA] ${MOCK_NOTE}`,
  };
}
