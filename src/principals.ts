import { createHash, timingSafeEqual } from "node:crypto";
import { compilePatterns, type CommandPolicy } from "./policy.js";

/**
 * A principal is an authenticated identity with a display name and role (for
 * audit/authorization) and an optional per-principal command policy. Its bearer
 * credential is either a plaintext `token`, or a `tokenHash` (SHA-256 hex of the
 * token) for keys issued by an external store that never shares the plaintext —
 * in which case a presented token authenticates when its SHA-256 matches.
 */
export type Principal = {
  name: string;
  role: string;
  token?: string;
  tokenHash?: string;
  policy: CommandPolicy;
};

/** The shape accepted in the WINBRIDGE_PRINCIPALS JSON array. */
type RawPrincipal = {
  name?: unknown;
  role?: unknown;
  token?: unknown;
  tokenEnv?: unknown;
  tokenHash?: unknown;
  allow?: unknown;
  deny?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown, path: string): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${path} must be an array of strings`);
  }
  return value as string[];
}

/**
 * Build the single implicit principal from the legacy WINBRIDGE_TOKEN. It is a
 * full-access "admin" identity so existing single-token deployments keep working
 * unchanged.
 */
export function createPrimaryPrincipal(token: string, policy: CommandPolicy): Principal {
  return { name: "default", role: "admin", token, policy };
}

/**
 * Parse WINBRIDGE_PRINCIPALS (a JSON array) into Principal objects. Each entry
 * supplies its token inline (`token`) or by naming an env var (`tokenEnv`), plus
 * optional `allow`/`deny` regex lists for a per-principal command policy.
 */
export function parsePrincipals(raw: string, env: Record<string, string | undefined>): Principal[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`WINBRIDGE_PRINCIPALS must be valid JSON: ${detail}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("WINBRIDGE_PRINCIPALS must be a non-empty JSON array");
  }

  return parsed.map((entry, index) => {
    const path = `WINBRIDGE_PRINCIPALS[${index}]`;
    if (!isRecord(entry)) {
      throw new Error(`${path} must be an object`);
    }

    const raw = entry as RawPrincipal;
    const name =
      typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : `principal-${index + 1}`;
    const role = typeof raw.role === "string" && raw.role.trim() ? raw.role.trim() : "user";

    const token = resolveToken(raw, env, path);
    const tokenHash = parseTokenHash(raw, path);
    if (!token && !tokenHash) {
      throw new Error(`${path} must define a non-empty "token", "tokenEnv", or "tokenHash"`);
    }

    const policy: CommandPolicy = {
      allow: compilePatterns(asStringArray(raw.allow, `${path}.allow`), `${path}.allow`),
      deny: compilePatterns(asStringArray(raw.deny, `${path}.deny`), `${path}.deny`)
    };

    return { name, role, token, tokenHash, policy };
  });
}

/** Validate an optional `tokenHash` (64-char hex SHA-256), normalized to lowercase. */
function parseTokenHash(raw: RawPrincipal, path: string): string | undefined {
  if (raw.tokenHash === undefined) {
    return undefined;
  }
  if (typeof raw.tokenHash !== "string" || !/^[0-9a-f]{64}$/i.test(raw.tokenHash.trim())) {
    throw new Error(`${path}.tokenHash must be a 64-character hex SHA-256 string`);
  }
  return raw.tokenHash.trim().toLowerCase();
}

function resolveToken(raw: RawPrincipal, env: Record<string, string | undefined>, path: string): string | undefined {
  if (typeof raw.token === "string" && raw.token) {
    return raw.token;
  }

  if (raw.tokenEnv !== undefined) {
    if (typeof raw.tokenEnv !== "string" || !raw.tokenEnv.trim()) {
      throw new Error(`${path}.tokenEnv must be a non-empty string`);
    }
    const value = env[raw.tokenEnv.trim()];
    if (!value) {
      throw new Error(`${path}.tokenEnv references empty env var ${raw.tokenEnv.trim()}`);
    }
    return value;
  }

  return undefined;
}

/** Constant-time comparison that does not short-circuit on content. */
function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two hex strings. */
function hexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** The SHA-256 hex that authenticates a principal — its tokenHash, or the hash of its token. */
function credentialHash(principal: Principal): string {
  if (principal.tokenHash) {
    return principal.tokenHash;
  }
  return principal.token ? sha256Hex(principal.token) : "";
}

/**
 * Look up the principal a presented `token` authenticates. A principal matches
 * when the token equals its plaintext `token` (constant-time) or when SHA-256 of
 * the token equals its `tokenHash` (constant-time). Every candidate is checked
 * (no early return) so response timing doesn't reveal which token is correct.
 */
export function resolvePrincipal(principals: Principal[], token: string): Principal | undefined {
  const presentedHash = sha256Hex(token);
  let match: Principal | undefined;
  for (const principal of principals) {
    if (principal.token !== undefined && tokensEqual(principal.token, token)) {
      match = principal;
    } else if (principal.tokenHash !== undefined && hexEqual(principal.tokenHash, presentedHash)) {
      match = principal;
    }
  }
  return match;
}

/**
 * Guard against two principals sharing a credential (which would make identity
 * ambiguous). Compares the SHA-256 that each principal authenticates by, so a
 * plaintext token and a matching tokenHash also collide.
 */
export function assertUniqueTokens(principals: Principal[]): void {
  const seen = new Set<string>();
  for (const principal of principals) {
    const key = credentialHash(principal);
    if (key && seen.has(key)) {
      throw new Error(
        `Duplicate principal credential detected (principal "${principal.name}"). Each principal needs a distinct token.`
      );
    }
    if (key) {
      seen.add(key);
    }
  }
}
