import { registerAiOperation } from "../orchestrator.js";

/**
 * Wave 1 Foundation stub operation. Exists only to prove the orchestrator
 * contract (registration, invocation, provenance tagging, restriction
 * enforcement) end-to-end before any real product AI operation exists.
 * Deliberately has no network dependency (no Anthropic API key is
 * configured in this build environment) — the real operations that
 * replace/join this one (analyze product, classify creator relevance,
 * generate match explanation, generate personalization, classify reply,
 * summarize conversation) arrive in later waves per the Step 5 build
 * order, each wired to a real Claude API call via packages/ai/src/client.ts.
 */
export interface StubEchoInput {
  text: string;
}

export interface StubEchoOutput {
  text: string;
  length: number;
}

registerAiOperation<StubEchoInput, StubEchoOutput>("stub_echo", async (input) => {
  return { text: input.text, length: input.text.length };
});
