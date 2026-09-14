import { describe, it, expect } from "vitest";
import { hashPassword, verifyPasswordHash } from "@rdv/lib";

describe("Password hashing (Wave 2 Phase 0)", () => {
  it("round-trips: a hashed password verifies against its own plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPasswordHash("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPasswordHash("wrong password", hash)).toBe(false);
  });

  it("two hashes of the same plaintext are never identical (salted)", async () => {
    const hashA = await hashPassword("same-password");
    const hashB = await hashPassword("same-password");
    expect(hashA).not.toBe(hashB);
    expect(await verifyPasswordHash("same-password", hashA)).toBe(true);
    expect(await verifyPasswordHash("same-password", hashB)).toBe(true);
  });
});
