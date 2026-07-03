/**
 * Command allow/deny policy.
 *
 * A policy is a pair of regular-expression lists. A command is allowed when:
 *   - no `deny` pattern matches (deny always wins), AND
 *   - the `allow` list is empty (allow everything not denied) OR at least one
 *     `allow` pattern matches.
 *
 * Policies compose: a request is evaluated against the global policy first and
 * then the caller's per-principal policy. The command must pass both.
 */

export type CommandPolicy = {
  allow: RegExp[];
  deny: RegExp[];
};

export type PolicyDecision = {
  allowed: boolean;
  /** Populated when `allowed` is false. Safe to surface to the caller. */
  reason?: string;
  /** The `source:pattern` that denied the command, when a deny rule matched. */
  matchedRule?: string;
};

export const EMPTY_POLICY: CommandPolicy = { allow: [], deny: [] };

/**
 * Compile a list of raw regex strings into RegExp objects. Patterns are matched
 * case-insensitively because PowerShell is case-insensitive. A malformed pattern
 * is a configuration error and fails loudly.
 */
export function compilePatterns(patterns: string[], label: string): RegExp[] {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid ${label} pattern ${JSON.stringify(pattern)}: ${detail}`);
    }
  });
}

function matches(patterns: RegExp[], command: string): RegExp | undefined {
  return patterns.find((pattern) => pattern.test(command));
}

/** Evaluate a single command against a single policy. */
export function evaluatePolicy(policy: CommandPolicy, command: string, source: string): PolicyDecision {
  const denied = matches(policy.deny, command);
  if (denied) {
    return {
      allowed: false,
      reason: `Command blocked by ${source} denylist`,
      matchedRule: `${source}:${denied.source}`
    };
  }

  if (policy.allow.length > 0 && !matches(policy.allow, command)) {
    return {
      allowed: false,
      reason: `Command is not permitted by the ${source} allowlist`,
      matchedRule: `${source}:allowlist`
    };
  }

  return { allowed: true };
}

/**
 * Evaluate a command against an ordered set of named policies (e.g. the global
 * policy followed by the principal's policy). The first policy that rejects the
 * command wins; if every policy permits it, the command is allowed.
 */
export function evaluatePolicies(
  command: string,
  policies: Array<{ source: string; policy: CommandPolicy }>
): PolicyDecision {
  for (const { source, policy } of policies) {
    const decision = evaluatePolicy(policy, command, source);
    if (!decision.allowed) {
      return decision;
    }
  }

  return { allowed: true };
}

/** True when a policy contains no rules and therefore permits everything. */
export function isUnrestricted(policy: CommandPolicy): boolean {
  return policy.allow.length === 0 && policy.deny.length === 0;
}
