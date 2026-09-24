import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Wave 6 (Job/Reply Reliability hardening — product vision: "signature
 * verification, replay protection, event IDs"): the provider-independent
 * verification primitive, built now so it exists and is genuinely tested
 * before any real provider is selected, rather than invented under time
 * pressure once one is. HMAC-SHA256-over-the-raw-body is the scheme used
 * by the overwhelming majority of webhook providers (Stripe, GitHub,
 * Resend, and — per its own public docs — Whop itself), so this is a real
 * reusable primitive, not speculative scaffolding for an unknown future
 * shape.
 *
 * What this module deliberately does NOT do: know which HTTP header a
 * specific provider puts its signature in, how that provider formats the
 * signed string (raw body alone vs. `${timestamp}.${body}`), or where a
 * provider's webhook secret is stored for a given workspace. Those are
 * the exact "authenticated provider boundary" details that depend on
 * which real provider gets selected (see docs/AUTONOMOUS_V1_PROGRESS.md)
 * — wiring a real public webhook endpoint is provider selection's very
 * next step, not something to guess at now. Event-id-based replay
 * protection (the other half of this product-vision requirement) is
 * already real and live: `inbound_messages`' unique index on
 * (workspace_id, provider, provider_message_id) — see
 * packages/domain/src/replies.ts's `ingestInboundMessage`.
 */

/**
 * Constant-time HMAC-SHA256 signature verification. Never uses `===` on
 * the raw signature (a timing side-channel that would let an attacker
 * discover a correct signature byte-by-byte) — always compares via
 * `timingSafeEqual` over equal-length buffers.
 */
export function verifyHmacSignature(params: { payload: string | Buffer; signature: string; secret: string }): boolean {
  const { payload, signature, secret } = params;
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  // Different lengths would make timingSafeEqual throw rather than return
  // false -- an invalid/malformed signature must be rejected, not crash
  // the caller.
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Replay-window check: even a genuinely valid signature on a genuinely
 * real event should be rejected once it's "too old" to plausibly be a
 * live delivery — this bounds how long a captured, valid-signature
 * request could be replayed if it ever leaked (e.g. via logs). Providers
 * that sign a timestamp as part of the payload (Stripe-style
 * `${timestamp}.${body}`) let a caller extract and pass it here; a
 * provider whose scheme has no timestamp simply can't use this half of
 * the check and relies solely on the event-id dedupe instead.
 */
export function isWithinReplayWindow(params: { eventTimestampMs: number; maxAgeMs?: number; now?: Date }): boolean {
  const { eventTimestampMs, maxAgeMs = 5 * 60 * 1000, now = new Date() } = params;
  const age = now.getTime() - eventTimestampMs;
  // Reject both "too old" and "from the future" (a clock-skew/forged
  // timestamp signal either way) -- never just a one-sided check.
  return age >= 0 && age <= maxAgeMs;
}
