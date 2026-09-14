import { describe, it, expect } from "vitest";
import {
  generateSetupToken,
  hashSetupToken,
  setupTokenHashesMatch,
  isSetupTokenExpired,
} from "@rdv/lib";

describe("Setup token primitives (Wave 2 Phase 0)", () => {
  it("the returned tokenHash is the deterministic hash of the raw token", () => {
    const { token, tokenHash } = generateSetupToken();
    expect(hashSetupToken(token)).toBe(tokenHash);
  });

  it("two generated tokens never collide", () => {
    const a = generateSetupToken();
    const b = generateSetupToken();
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).not.toBe(b.tokenHash);
  });

  it("setupTokenHashesMatch is true only for the matching hash", () => {
    const { token, tokenHash } = generateSetupToken();
    const other = generateSetupToken();
    expect(setupTokenHashesMatch(hashSetupToken(token), tokenHash)).toBe(true);
    expect(setupTokenHashesMatch(other.tokenHash, tokenHash)).toBe(false);
  });

  it("expiresAt is in the future on generation, and isSetupTokenExpired reflects a past date", () => {
    const { expiresAt } = generateSetupToken();
    expect(isSetupTokenExpired(expiresAt)).toBe(false);
    expect(isSetupTokenExpired(new Date(Date.now() - 1000))).toBe(true);
  });
});
