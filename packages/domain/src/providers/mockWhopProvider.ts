import { randomUUID } from "node:crypto";
import {
  registerWhopProvider,
  type WhopCreateAffiliateInput,
  type WhopCreateAffiliateOutcome,
  type WhopConversionRecord,
} from "../whopProvider.js";

/**
 * Real, deterministic, network-free implementation of WhopProvider — not a
 * stand-in that always claims success. Used for local/dev/test until real
 * Whop credentials are selected and authorized (see
 * docs/AUTONOMOUS_V1_PROGRESS.md). Self-registers on import, same
 * convention as ../providers/mockOutreachProvider.ts.
 *
 * Deterministic simulation convention (identical to mockOutreachProvider's
 * test-address convention, since creatorIdentity is an email address
 * here): the *local part* of the identity controls the outcome, so tests
 * can exercise every real code path without a hidden config flag
 * polluting the provider interface itself.
 *   - local part ends with "+mockfail"    -> failed
 *   - local part ends with "+mockunknown" -> unknown (ambiguous/timeout)
 *   - anything else                        -> active
 *
 * getConversions deliberately always returns zero records — it is a real,
 * honest "nothing new since last poll" response, never fabricated
 * conversion data. Tests that need to prove conversion ingestion/dedupe
 * logic call the domain layer's ingestWhopConversion directly with
 * explicit fixture data, the same way Wave 3's reply tests called
 * ingestInboundMessage directly rather than asking the mock provider to
 * invent an inbound reply.
 */
export function mockOutcomeForCreatorIdentity(input: WhopCreateAffiliateInput): WhopCreateAffiliateOutcome {
  const localPart = (input.creatorIdentity ?? "").split("@")[0] ?? "";
  if (localPart.endsWith("+mockfail")) {
    return { status: "failed", errorMessage: "Mock Whop provider: simulated permanent failure for this creator." };
  }
  if (localPart.endsWith("+mockunknown")) {
    return { status: "unknown", errorMessage: "Mock Whop provider: simulated timeout — result is uncertain." };
  }
  return {
    status: "active",
    providerAffiliateId: `mock-affiliate-${randomUUID()}`,
    affiliateCode: `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`,
  };
}

registerWhopProvider({
  name: "mock",
  async createAffiliate(input: WhopCreateAffiliateInput): Promise<WhopCreateAffiliateOutcome> {
    return mockOutcomeForCreatorIdentity(input);
  },
  async getConversions(): Promise<{ records: WhopConversionRecord[]; nextCursor: string | null }> {
    return { records: [], nextCursor: null };
  },
});
