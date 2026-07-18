import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit.js";
import type { Principal } from "../principals.js";
import type { PowerShellResult } from "../powershell/types.js";
import { evaluatePolicies } from "../policy.js";
import { effectiveRateLimits } from "../rateLimit.js";
import type { ToolContext } from "./types.js";

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

/**
 * Enforce the per-principal rate limit + daily quota before a tool runs. Runs at
 * the very top of every tool call (ahead of the command policy), so a throttled
 * call never reaches the underlying tool. Returns a structured throttle error
 * (and audits it as `decision: "blocked"` with a distinguishing `reason` and a
 * `retryAfter` hint) when the principal is over budget, or undefined to proceed.
 *
 * When neither a global nor a per-principal limit is configured the check is a
 * no-op, so default deployments are unaffected.
 */
export async function checkRateLimit(ctx: ToolContext, tool: string) {
  const { config, principal, audit, rateLimiter } = ctx;
  const decision = rateLimiter.check(principal.name, effectiveRateLimits(config, principal));
  if (decision.allowed) {
    return undefined;
  }

  await audit.log({
    time: new Date().toISOString(),
    principal: principal.name,
    role: principal.role,
    tool,
    decision: "blocked",
    reason: decision.reason,
    retryAfter: decision.retryAfter
  });

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { blocked: true, reason: decision.reason, retryAfter: decision.retryAfter },
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
