import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM helper for at-rest secrets that must never be stored as
 * plaintext — Gmail OAuth refresh tokens and SMTP passwords on
 * `sender_accounts` (see server/db/schema.ts). No existing encryption
 * helper was found in this codebase, so this is new.
 *
 * Keyed off OUTREACH_ENCRYPTION_KEY, validated lazily (at first use) rather
 * than at boot in config/env.ts — this is a new, opt-in feature, so an
 * existing live deployment that hasn't set the var yet shouldn't be taken
 * down (CFG-01 only requires failing fast for keys required to boot at all).
 * Generate one with: `openssl rand -base64 32`.
 */

const IV_LENGTH = 12; // GCM standard nonce size
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.OUTREACH_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "OUTREACH_ENCRYPTION_KEY is not configured — required to store or read sender-account secrets",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("OUTREACH_ENCRYPTION_KEY must decode to exactly 32 bytes (base64)");
  }
  return key;
}

/** Encrypt a secret for storage. Output: base64(iv || authTag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Decrypt a secret produced by encryptSecret. Throws on tampered/malformed input. */
export function decryptSecret(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
