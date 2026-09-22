import { randomUUID } from "node:crypto";
import { registerOutreachProvider, type OutreachSendInput, type OutreachSendOutcome } from "../outreachProvider.js";

/**
 * Real, deterministic, network-free implementation of OutreachProvider --
 * not a stand-in that always claims success. Used for local/dev/test until
 * a real provider is selected and authorized (see
 * docs/AUTONOMOUS_V1_PROGRESS.md). Self-registers on import, mirroring how
 * @rdv/ai operations self-register (see e.g. packages/ai/src/operations/*).
 *
 * Deterministic simulation convention (test-only, same spirit as a
 * payment provider's test card numbers): the *local part* of the
 * recipient address controls the outcome, so tests can exercise every
 * real code path without a hidden config flag polluting the provider
 * interface itself.
 *   - local part ends with "+mockfail"    -> failed
 *   - local part ends with "+mockunknown" -> unknown (ambiguous/timeout)
 *   - anything else                        -> sent
 */
export function mockOutcomeForRecipient(input: OutreachSendInput): OutreachSendOutcome {
  const localPart = input.to.split("@")[0] ?? "";
  if (localPart.endsWith("+mockfail")) {
    return { status: "failed", errorMessage: "Mock provider: simulated permanent failure for this recipient." };
  }
  if (localPart.endsWith("+mockunknown")) {
    return { status: "unknown", errorMessage: "Mock provider: simulated timeout -- provider result is uncertain." };
  }
  return {
    status: "sent",
    providerMessageId: `mock-msg-${randomUUID()}`,
    providerThreadId: `mock-thread-${input.idempotencyKey}`,
  };
}

registerOutreachProvider({
  name: "mock",
  async send(input: OutreachSendInput): Promise<OutreachSendOutcome> {
    return mockOutcomeForRecipient(input);
  },
});
