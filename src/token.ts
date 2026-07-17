import { randomBytes } from "node:crypto";

/**
 * Generate a fresh, cryptographically random bearer token. Encoded as base64url
 * so it is copy/paste-safe in URLs, HTTP headers, JSON, and shell env vars with
 * no characters that need escaping.
 *
 * The default of 32 bytes yields a 43-character token — comfortably above the
 * 24-character weak-token threshold WinReach warns about for public tunnels.
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
