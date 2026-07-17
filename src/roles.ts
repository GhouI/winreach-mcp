import { compilePatterns, type CommandPolicy } from "./policy.js";

/**
 * A named role is a reusable permission template. A principal that references a
 * role by name (its `role` field) inherits the role's command policy and tool
 * allowlist. Any of those fields set on the principal itself override the role's
 * value for that field, so a role provides defaults a principal can specialize.
 *
 * Roles are defined in WINREACH_ROLES, a JSON object keyed by role name:
 *
 *   {
 *     "deployer": { "tools": ["powershell_execute", "file_upload"],
 *                   "allow": ["^Get-", "^Copy-Item"], "deny": ["Remove-Item"] },
 *     "auditor":  { "tools": ["powershell_execute"], "allow": ["^Get-", "^Test-"] }
 *   }
 *
 * The role name is still just a label to the rest of the server (audit records,
 * screenshot role gating): defining a role only enriches the principals that
 * reference it — it changes nothing on its own.
 */
export type RoleDefinition = {
  policy: CommandPolicy;
  /** Tool allowlist inherited by referencing principals. `undefined` = every tool. */
  tools?: string[];
};

type RawRole = {
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
 * Parse WINREACH_ROLES (a JSON object mapping role name to a permission set)
 * into compiled role definitions. Every field of a role is optional; an omitted
 * `tools` grants every tool, and omitted `allow`/`deny` mean no policy for that
 * dimension.
 */
export function parseRoles(raw: string): Map<string, RoleDefinition> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`WINREACH_ROLES must be valid JSON: ${detail}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("WINREACH_ROLES must be a JSON object mapping a role name to a permission set");
  }

  const roles = new Map<string, RoleDefinition>();
  for (const [rawName, value] of Object.entries(parsed)) {
    const name = rawName.trim();
    if (!name) {
      throw new Error("WINREACH_ROLES contains an empty role name");
    }
    const path = `WINREACH_ROLES.${name}`;
    if (!isRecord(value)) {
      throw new Error(`${path} must be an object`);
    }
    const role = value as RawRole;
    const policy: CommandPolicy = {
      allow: compilePatterns(asStringArray(role.allow, `${path}.allow`), `${path}.allow`),
      deny: compilePatterns(asStringArray(role.deny, `${path}.deny`), `${path}.deny`)
    };
    const tools = role.tools === undefined ? undefined : asStringArray(role.tools, `${path}.tools`);
    roles.set(name, { policy, tools });
  }
  return roles;
}
