import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Foundation credential encryption (Step 5 §5.1: "workspace-scoped,
 * encrypted, never exposed in plaintext"). AES-256-GCM with a per-value
 * random IV. The master key comes from CREDENTIALS_MASTER_KEY (a long
 * random passphrase in dev/local; a real KMS-backed secret in production —
 * see docs/SECURITY.md). This module never logs the plaintext or the key.
 */

const ALGO = "aes-256-gcm";

function deriveKey(masterKey: string): Buffer {
  // scrypt with a fixed, non-secret salt is acceptable here because the
  // secret material is the master key itself, not the salt; this only
  // derives a 32-byte key of the right shape for AES-256.
  return scryptSync(masterKey, "rdv-outreach-os-credential-salt-v1", 32);
}

function getMasterKey(): string {
  const key = process.env.CREDENTIALS_MASTER_KEY;
  if (!key || key.length < 16) {
    throw new Error(
      "CREDENTIALS_MASTER_KEY is not set (or too short). Refusing to encrypt/decrypt credentials without it."
    );
  }
  return key;
}

export interface EncryptedPayload {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  const key = deriveKey(getMasterKey());
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedPayload): string {
  const key = deriveKey(getMasterKey());
  const decipher = createDecipheriv(ALGO, key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
