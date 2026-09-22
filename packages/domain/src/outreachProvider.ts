/**
 * Wave 3 (Live Outreach + Reply Intelligence): the outreach send provider
 * abstraction. Mirrors @rdv/ai's orchestrator shape deliberately (one
 * centralized registry, business-shaped operations, a single active
 * implementation at a time) rather than a generic multi-vendor plugin
 * system -- the existing `credential_provider` enum already carries a
 * single generic "outreach_provider" slot (see packages/db/src/schema.ts),
 * which is the authoritative architecture's own hook for exactly this: one
 * provider active per workspace, swappable without touching call sites.
 *
 * No outreach provider has been selected for this application yet (see
 * docs/AUTONOMOUS_V1_PROGRESS.md) -- this interface exists so the full
 * send pipeline (safety gate, idempotency, retries, history, audit) can be
 * built and genuinely tested now, against the real MockOutreachProvider in
 * ./providers/mockOutreachProvider.ts, without inventing a fake real
 * provider or fabricating a successful live send.
 */

export interface OutreachSendInput {
  to: string;
  subject: string;
  body: string;
  /** Passed through so a real provider can also dedupe on its own side where it supports that. */
  idempotencyKey: string;
}

/**
 * A provider's send result is exactly one of these three shapes -- never a
 * bare boolean. `unknown` is not an error type to catch and retry blindly;
 * it is a first-class outcome the domain layer must persist and never
 * silently upgrade to `sent` or `failed` (product vision's mandatory
 * UNKNOWN/AMBIGUOUS rule).
 */
export type OutreachSendOutcome =
  | { status: "sent"; providerMessageId: string; providerThreadId?: string | null }
  | { status: "failed"; errorMessage: string }
  | { status: "unknown"; errorMessage: string };

export interface OutreachProvider {
  name: string;
  send(input: OutreachSendInput): Promise<OutreachSendOutcome>;
}

const registry = new Map<string, OutreachProvider>();

export function registerOutreachProvider(provider: OutreachProvider): void {
  if (registry.has(provider.name)) {
    throw new Error(`Outreach provider "${provider.name}" is already registered`);
  }
  registry.set(provider.name, provider);
}

export function getOutreachProvider(name: string): OutreachProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`No outreach provider registered with name "${name}"`);
  }
  return provider;
}

export function listRegisteredOutreachProviderNames(): string[] {
  return [...registry.keys()];
}

/**
 * Resolves which provider a workspace's sends should execute through.
 * Today this always returns "mock" -- no real outreach_provider credential
 * has ever been stored (integration_credentials is empty; no provider SDK
 * exists in this codebase). When a real provider is added, this is the
 * one function that changes to prefer a workspace's configured credential
 * over the mock fallback; nothing else in the send pipeline needs to know
 * which provider is active.
 */
export function resolveOutreachProviderName(): string {
  return "mock";
}
