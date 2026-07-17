import { timingSafeEqual } from "node:crypto";
import { compilePatterns, type CommandPolicy } from "./policy.js";

/**
 * A principal is an authenticated identity. Each principal has its own bearer
 * token, a display name and role (for audit logging and authorization), and an
 * optional per-principal command policy that further restricts what the
 * principal may run on top of the global policy.
 */
export type Principal = {
  name: string;
  role: string;
  token: string;
  policy: CommandPolicy;
  /**
   * Optional allowlist of MCP tool names this principal may use. `undefined`
   * means every tool (subject to the global gates), so existing principals keep
   * full access. A list — even an empty one — restricts the principal to exactly
   * those tools.
   */
  tools?: string[];
};

/** The shape accepted in the WINBRIDGE_PRINCIPALS JSON array. */
type RawPrincipal = {
  name?: unknown;
  role?: unknown;
  token?: unknown;
  tokenEnv?: unknown;
  allow?: unknown;
  deny?: unknown;
  tools?: unknown;
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
    if (!token) {
      throw new Error(`${path} must define a non-empty "token" or "tokenEnv"`);
    }

    const policy: CommandPolicy = {
      allow: compilePatterns(asStringArray(raw.allow, `${path}.allow`), `${path}.allow`),
      deny: compilePatterns(asStringArray(raw.deny, `${path}.deny`), `${path}.deny`)
    };

    // `tools` is only a restriction when present; leave it undefined otherwise so
    // the principal keeps access to every tool.
    const tools = raw.tools === undefined ? undefined : asStringArray(raw.tools, `${path}.tools`);

    return { name, role, token, policy, tools };
  });
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

/** Constant-time comparison that does not short-circuit on length or content. */
function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Look up the principal whose token matches `token`. Every candidate is checked
 * with a constant-time comparison so a caller cannot learn which token prefix is
 * correct from response timing, and so token length is not leaked by an early
 * return. Returns undefined when nothing matches.
 */
export function resolvePrincipal(principals: Principal[], token: string): Principal | undefined {
  let match: Principal | undefined;
  for (const principal of principals) {
    if (tokensEqual(principal.token, token)) {
      match = principal;
    }
  }
  return match;
}

/** Guard against two principals sharing a token, which would make identity ambiguous. */
export function assertUniqueTokens(principals: Principal[]): void {
  const seen = new Set<string>();
  for (const principal of principals) {
    if (seen.has(principal.token)) {
      throw new Error(
        `Duplicate principal token detected (principal "${principal.name}"). Each principal needs a distinct token.`
      );
    }
    seen.add(principal.token);
  }
}
