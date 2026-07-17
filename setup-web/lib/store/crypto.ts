// Security primitives for the account store. node:crypto only — no dependencies.
//
//   Passwords  -> scrypt (salted, slow)                  : login
//   Tokens     -> SHA-256 hash (fast, deterministic)     : agent auth / lookup
//   At rest    -> AES-256-GCM (key from WINREACH_DB_KEY) : reversible secrets
//
// A stored bearer token is NEVER kept in plaintext: its SHA-256 hash is used to
// authenticate, and (optionally) an AES-GCM-encrypted copy lets an operator
// re-reveal it. Combined with HTTPS to the app and TLS to the database, secrets
// are encrypted in transit and at rest.

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

/* ------------------------------- passwords -------------------------------- */

/** scrypt password hash, encoded as `scrypt$N$salthex$hashhex`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$16384$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/** Constant-time verify against a hashPassword() string. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[2], "hex");
  const expected = Buffer.from(parts[3], "hex");
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* --------------------------------- tokens --------------------------------- */

/** A high-entropy bearer token (32 random bytes, hex). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Deterministic hash used to store/verify a token. Tokens are 256-bit random,
 * so a fast hash is safe (no dictionary attack) and lets us look up by hash.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of two token hashes (hex strings). */
export function tokenHashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && bufA.length > 0 && timingSafeEqual(bufA, bufB);
}

/* --------------------------- encryption at rest --------------------------- */

const MISSING_KEY =
  "WINREACH_DB_KEY is not set. Set a long random secret to encrypt data at rest.";

/** Derive a 32-byte AES key from the WINREACH_DB_KEY secret. */
function encryptionKey(): Buffer {
  const secret = process.env.WINREACH_DB_KEY;
  if (!secret) throw new Error(MISSING_KEY);
  // Fixed salt: the derived key must be stable so ciphertext round-trips.
  return scryptSync(secret, "winreach-db-key", 32);
}

export function encryptionAvailable(): boolean {
  return Boolean(process.env.WINREACH_DB_KEY);
}

/** AES-256-GCM encrypt -> `v1$ivhex$taghex$cipherhex`. */
export function encryptAtRest(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1$${iv.toString("hex")}$${tag.toString("hex")}$${enc.toString("hex")}`;
}

/** Inverse of encryptAtRest(). Throws if the key is wrong or data is tampered. */
export function decryptAtRest(payload: string): string {
  const parts = payload.split("$");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed encrypted payload.");
  }
  const key = encryptionKey();
  const iv = Buffer.from(parts[1], "hex");
  const tag = Buffer.from(parts[2], "hex");
  const enc = Buffer.from(parts[3], "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
