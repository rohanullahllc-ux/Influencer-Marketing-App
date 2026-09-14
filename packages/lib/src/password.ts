import bcrypt from "bcryptjs";

/**
 * Wave 2 Phase 0 password hashing (§5, §14.1: `users.password_hash`).
 * Deliberately separate from encryption.ts's AES-256-GCM — that module is
 * for *reversible* secrets (third-party API credentials); passwords must
 * never be reversible, so this uses bcrypt (salted, one-way) instead.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPasswordHash(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}
