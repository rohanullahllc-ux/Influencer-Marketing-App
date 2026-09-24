import { describe, it, expect } from "vitest";
import { listRegisteredAiOperations, assertAllowedAiOperationName } from "@rdv/ai";

/**
 * Wave 6 (AI safety hardening audit): every AI operation actually
 * registered in this build — not just a hand-picked example — must pass
 * the hard-restriction check. This is a structural, self-verifying
 * regression guard: if a future operation is added whose name would trip
 * `assertAllowedAiOperationName` (e.g. containing "approve" or "send"),
 * registration itself already throws at import time (proven by
 * tests/ai.orchestrator.test.ts), so the mere fact that every operation
 * in this list registered successfully is itself proof they all passed —
 * this test makes that proof explicit and permanent rather than implicit
 * in "the app didn't crash on boot."
 */
describe("AI hardening: every registered operation is a legitimately-named business operation (Wave 6)", () => {
  it("lists at least the six real Wave 2-4 operations, and every one of them passes the hard restriction check", () => {
    const registered = listRegisteredAiOperations();

    // Sanity: this must not silently pass on an empty/partial registry.
    expect(registered).toEqual(
      expect.arrayContaining([
        "analyze_product",
        "explain_creator_match",
        "personalize_outreach",
        "classify_reply",
        "draft_reply_response",
        "summarize_creator_conversation",
      ])
    );

    for (const name of registered) {
      expect(() => assertAllowedAiOperationName(name), `operation "${name}"`).not.toThrow();
    }
  });
});
