import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyHmacSignature, isWithinReplayWindow } from "@rdv/lib";

/**
 * Wave 6 hardening: the provider-independent webhook signature
 * verification + replay-window primitive (see packages/lib/src/
 * webhookVerification.ts's own doc comment for why this is real,
 * testable infrastructure now rather than speculative scaffolding).
 */
describe("Webhook signature verification (Wave 6)", () => {
  const secret = "a-real-webhook-secret";
  const payload = JSON.stringify({ event: "message.received", id: "evt_123" });

  function sign(body: string, withSecret = secret): string {
    return createHmac("sha256", withSecret).update(body).digest("hex");
  }

  it("accepts a genuinely correctly-signed payload", () => {
    expect(verifyHmacSignature({ payload, signature: sign(payload), secret })).toBe(true);
  });

  it("rejects a tampered payload even with an otherwise-valid-looking signature", () => {
    const validSignatureForOriginal = sign(payload);
    const tamperedPayload = JSON.stringify({ event: "message.received", id: "evt_999" });
    expect(verifyHmacSignature({ payload: tamperedPayload, signature: validSignatureForOriginal, secret })).toBe(false);
  });

  it("rejects a signature produced with the wrong secret", () => {
    expect(verifyHmacSignature({ payload, signature: sign(payload, "wrong-secret"), secret })).toBe(false);
  });

  it("rejects a malformed/wrong-length signature without throwing", () => {
    expect(() => verifyHmacSignature({ payload, signature: "not-a-real-signature", secret })).not.toThrow();
    expect(verifyHmacSignature({ payload, signature: "not-a-real-signature", secret })).toBe(false);
  });

  it("rejects an empty signature or empty secret", () => {
    expect(verifyHmacSignature({ payload, signature: "", secret })).toBe(false);
    expect(verifyHmacSignature({ payload, signature: sign(payload), secret: "" })).toBe(false);
  });

  it("accepts a fresh event within the replay window", () => {
    const now = new Date("2026-01-01T00:05:00Z");
    const eventTimestampMs = new Date("2026-01-01T00:00:00Z").getTime();
    expect(isWithinReplayWindow({ eventTimestampMs, maxAgeMs: 10 * 60 * 1000, now })).toBe(true);
  });

  it("rejects a stale event outside the replay window", () => {
    const now = new Date("2026-01-01T00:20:00Z");
    const eventTimestampMs = new Date("2026-01-01T00:00:00Z").getTime();
    expect(isWithinReplayWindow({ eventTimestampMs, maxAgeMs: 10 * 60 * 1000, now })).toBe(false);
  });

  it("rejects a future-dated event (clock skew / forged timestamp), not just a stale one", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const eventTimestampMs = new Date("2026-01-01T00:10:00Z").getTime(); // 10 minutes in the future
    expect(isWithinReplayWindow({ eventTimestampMs, maxAgeMs: 5 * 60 * 1000, now })).toBe(false);
  });
});
