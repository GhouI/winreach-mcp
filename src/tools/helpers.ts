import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit.js";
import type { Principal } from "../principals.js";
import type { PowerShellResult } from "../powershell/types.js";
import { resolveBashPath } from "../bash/shell.js";
import { evaluatePolicies } from "../policy.js";

/**
 * Enforce the global + per-principal command policy before a command runs.
 * Returns a blocked tool result (and audits the denial) when the command is not
 * permitted, or undefined when it may proceed.
 */
export async function enforcePolicy(
  config: AppConfig,
  principal: Principal,
  audit: AuditLogger,
  tool: string,
  command: string,
  cwd: string | undefined,
  sessionId?: string
) {
  const decision = evaluatePolicies(command, [
    { source: "global", policy: config.globalPolicy },
    { source: principal.name, policy: principal.policy }
  ]);

  if (decision.allowed) {
    return undefined;
  }

  await audit.log({
    time: new Date().toISOString(),
    principal: principal.name,
    role: principal.role,
    tool,
    decision: "blocked",
    command,
    cwd,
    sessionId,
    reason: decision.reason
  });

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { blocked: true, reason: decision.reason, matchedRule: decision.matchedRule },
          null,
          2
        )
      }
    ]
  };
}

export async function auditResult(
  audit: AuditLogger,
  principal: Principal,
  tool: string,
  result: PowerShellResult,
  command: string,
  cwd: string | undefined,
  sessionId?: string
): Promise<void> {
  await audit.log({
    time: new Date().toISOString(),
    principal: principal.name,
    role: principal.role,
    tool,
    decision: "allowed",
    command,
    cwd,
    sessionId,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  });
}

/**
 * Whether `principal` may capture the screen. Screen capture is off unless the
 * operator enabled it; when enabled, an empty role list allows any principal,
 * otherwise the principal's role must be listed.
 */
export function isScreenshotAllowed(config: AppConfig, principal: Principal): boolean {
  if (!config.screenshot.enabled) {
    return false;
  }
  const roles = config.screenshot.allowedRoles;
  return roles.length === 0 || roles.includes(principal.role);
}

/**
 * Whether `principal` may drive the desktop. Off unless the operator enabled it;
 * when enabled, an empty role list allows any principal, otherwise the
 * principal's role must be listed.
 */
export function isComputerUseAllowed(config: AppConfig, principal: Principal): boolean {
  if (!config.computerUse.enabled) {
    return false;
  }
  const roles = config.computerUse.allowedRoles;
  return roles.length === 0 || roles.includes(principal.role);
}

/**
 * Whether the Git Bash tool family may be offered. Bash is an alternate
 * execution surface under the same command policy, so it is gated only by the
 * operator enable flag (WINREACH_ALLOW_BASH) and whether `bash.exe` resolves —
 * the per-principal `tools` allowlist still gates each individual tool.
 */
export function isBashAvailable(config: AppConfig): boolean {
  if (!config.bash.enabled) {
    return false;
  }
  return resolveBashPath(config.bash.path) !== undefined;
}
