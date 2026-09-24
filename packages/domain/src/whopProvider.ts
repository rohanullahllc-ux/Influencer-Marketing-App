/**
 * Wave 4 (Whop Affiliate/Conversion): the Whop provider abstraction.
 * Mirrors packages/domain/src/outreachProvider.ts's shape deliberately —
 * one centralized registry, business-shaped operations, a single active
 * implementation at a time — not a generic multi-vendor plugin system.
 * The existing `credential_provider` enum already carries a dedicated
 * "whop" slot (see packages/db/src/schema.ts), which is the authoritative
 * architecture's own hook for exactly this.
 *
 * No Whop API credentials exist for this application yet (see
 * docs/AUTONOMOUS_V1_PROGRESS.md) — this interface exists so the full
 * human-triggered affiliate creation + polling conversion pipeline
 * (idempotency, retries, history, audit) can be built and genuinely
 * tested now, against the real MockWhopProvider in
 * ./providers/mockWhopProvider.ts, without inventing a fake real
 * provider or fabricating a successful affiliate creation / conversion.
 */

export interface WhopCreateAffiliateInput {
  creatorIdentity: string;
  commercialMetadata: Record<string, unknown> | null;
  idempotencyKey: string;
}

/**
 * A provider's affiliate-creation result is exactly one of these three
 * shapes — never a bare boolean. `unknown` is a first-class outcome the
 * domain layer must persist and never silently upgrade to `active` or
 * `failed` (same UNKNOWN/AMBIGUOUS rule the product vision requires for
 * outreach sends).
 */
export type WhopCreateAffiliateOutcome =
  | { status: "active"; providerAffiliateId: string; affiliateCode: string }
  | { status: "failed"; errorMessage: string }
  | { status: "unknown"; errorMessage: string };

export interface WhopConversionRecord {
  providerEventId: string;
  eventType: "click" | "order" | "conversion";
  occurredAt: Date;
  amount: number | null;
  currency: string | null;
  rawPayload: unknown;
}

export interface WhopProvider {
  name: string;
  createAffiliate(input: WhopCreateAffiliateInput): Promise<WhopCreateAffiliateOutcome>;
  getConversions(input: {
    providerAffiliateId: string;
    sinceCursor: string | null;
  }): Promise<{ records: WhopConversionRecord[]; nextCursor: string | null }>;
}

const registry = new Map<string, WhopProvider>();

export function registerWhopProvider(provider: WhopProvider): void {
  if (registry.has(provider.name)) {
    throw new Error(`Whop provider "${provider.name}" is already registered`);
  }
  registry.set(provider.name, provider);
}

export function getWhopProvider(name: string): WhopProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`No Whop provider registered with name "${name}"`);
  }
  return provider;
}

export function listRegisteredWhopProviderNames(): string[] {
  return [...registry.keys()];
}

/**
 * Resolves which provider affiliate/conversion operations execute
 * through. Today this always returns "mock" — no real Whop credential has
 * ever been stored (integration_credentials is empty; no Whop SDK exists
 * in this codebase). When real Whop credentials are added, this is the
 * one function that changes; nothing else in the pipeline needs to know
 * which provider is active.
 */
export function resolveWhopProviderName(): string {
  return "mock";
}
