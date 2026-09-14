import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Wave 2 Phase 0 one-time account-setup tokens (plan §5, §14.1). Unlike
 * password.ts's bcrypt (intentionally non-deterministic, verified against a
 * user already identified by email), a setup token must be looked up
 * *before* we know which user it belongs to — so it uses a deterministic
 * hash (SHA-256) that can be matched with a direct `WHERE setup_token_hash
 * = ...` query, while the raw token itself is never stored, only its hash.
 * An Owner/Admin generates this once and relays it out-of-band (no
 * transactional email provider exists yet — see docs/DECISIONS.md); the
 * member consumes it exactly once to set their own password, so the
 * Owner/Admin never learns or holds that password.
 */
const TOKEN_BYTES = 32;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface GeneratedSetupToken {
  token: string; // raw — returned to the caller exactly once, never stored
  tokenHash: string; // stored in users.setup_token_hash
  expiresAt: Date;
}

export function generateSetupToken(): GeneratedSetupToken {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return {
    token,
    tokenHash: hashSetupToken(token),
    expiresAt: new Date(Date.now() + EXPIRY_MS),
  };
}

export function hashSetupToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time hash comparison — avoids leaking timing information about a near-match. */
export function setupTokenHashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isSetupTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}
