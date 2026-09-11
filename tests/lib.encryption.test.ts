import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@rdv/lib";

describe("credential encryption round-trip", () => {
  it("encrypts and decrypts back to the original plaintext", () => {
    const plaintext = "sk-live-super-secret-api-key-1234567890";
    const payload = encryptSecret(plaintext);
    expect(payload.ciphertext).not.toContain(plaintext);
    expect(decryptSecret(payload)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", () => {
    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt if the auth tag has been tampered with", () => {
    const payload = encryptSecret("tamper-test");
    const tampered = { ...payload, authTag: Buffer.alloc(16, 0).toString("base64") };
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
