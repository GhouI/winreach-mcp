import type { AppConfig } from "./config.js";
import type { Principal } from "./principals.js";

/**
 * The per-principal limits that actually apply to a call: a per-minute request
 * rate and an optional daily call quota. `0` on either dimension means that
 * dimension is disabled. Resolved from the global defaults, overridden by the
 * principal's own values when set — see {@link effectiveRateLimits}.
 */
export type EffectiveRateLimits = {
  /** Requests per 60s window (token bucket). `0` = no per-minute limit. */
  perMin: number;
  /** Calls per UTC calendar day (fixed window). `0` = no daily quota. */
  dailyQuota: number;
};

/**
 * The outcome of a rate-limit check. When `allowed` is false, `reason`
 * distinguishes the per-minute rate cap from the daily quota and `retryAfter`
 * is a whole-second hint after which the caller may succeed.
 */
export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "rate limited" | "quota exceeded"; retryAfter: number };

/**
 * Per-principal limiter state kept for the lifetime of the process: a token
 * bucket for the per-minute rate (refilled continuously) and a fixed-window
 * daily counter that resets at UTC midnight.
 */
type PrincipalState = {
  /** Current tokens in the per-minute bucket. */
  tokens: number;
  /** Timestamp (ms) the bucket was last refilled. */
  last: number;
  /** Calls counted in the current UTC day. */
  dailyCount: number;
  /** Timestamp (ms) at which the daily window rolls over (next UTC midnight). */
  dayResetAt: number;
};

/** The next UTC midnight strictly after `now` (ms since epoch). */
function nextUtcMidnight(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
}

/**
 * Resolve the limits that apply to `principal`: each dimension is the
 * principal's own value when it set one, otherwise the global default. An
 * explicit `0` on the principal disables that dimension for it even when a
 * global default is set (an intentional per-principal opt-out).
 */
export function effectiveRateLimits(config: AppConfig, principal: Principal): EffectiveRateLimits {
  return {
    perMin: principal.rateLimitPerMin ?? config.rateLimit.perMin,
    dailyQuota: principal.dailyQuota ?? config.rateLimit.dailyQuota
  };
}

/**
 * Process-lifetime, in-memory rate-limit store keyed by principal name. Created
 * once at app startup (alongside `sessions`/`audit`) and shared across every
 * request, so a principal's usage actually accumulates across the fresh
 * `McpServer` built per request. State is per-principal, so one principal being
 * throttled never affects another.
 *
 * This is intentionally per-process and non-distributed (like the existing
 * `computer_use` limiter and the setup-web guard); front WinReach with a proxy
 * to bound usage across multiple instances.
 */
export class RateLimiterStore {
  private readonly states = new Map<string, PrincipalState>();
  private readonly now: () => number;

  /** `now` is injectable so tests can drive time deterministically. */
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /**
   * Check (and, when allowed, consume) one unit of `principal`'s budget under
   * `limits`. The daily quota is peeked first so a call rejected by the
   * per-minute bucket does not burn quota, and the quota is only incremented
   * once both dimensions pass. When both limits are disabled this is a no-op.
   */
  check(principalName: string, limits: EffectiveRateLimits): RateLimitDecision {
    if (limits.perMin <= 0 && limits.dailyQuota <= 0) {
      return { allowed: true };
    }

    const now = this.now();
    let state = this.states.get(principalName);
    if (!state) {
      state = { tokens: limits.perMin, last: now, dailyCount: 0, dayResetAt: nextUtcMidnight(now) };
      this.states.set(principalName, state);
    }

    // Daily quota: fixed window that resets at UTC midnight. Peek only — do not
    // count the call yet, so a call the per-minute bucket rejects is not charged.
    if (limits.dailyQuota > 0) {
      if (now >= state.dayResetAt) {
        state.dailyCount = 0;
        state.dayResetAt = nextUtcMidnight(now);
      }
      if (state.dailyCount >= limits.dailyQuota) {
        return {
          allowed: false,
          reason: "quota exceeded",
          retryAfter: Math.max(1, Math.ceil((state.dayResetAt - now) / 1000))
        };
      }
    }

    // Per-minute rate: token bucket refilled at perMin/60 tokens per second.
    if (limits.perMin > 0) {
      const refillPerSec = limits.perMin / 60;
      state.tokens = Math.min(limits.perMin, state.tokens + ((now - state.last) / 1000) * refillPerSec);
      state.last = now;
      if (state.tokens < 1) {
        return {
          allowed: false,
          reason: "rate limited",
          retryAfter: Math.max(1, Math.ceil((1 - state.tokens) / refillPerSec))
        };
      }
      state.tokens -= 1;
    }

    // Both dimensions passed — charge the call against the daily quota.
    if (limits.dailyQuota > 0) {
      state.dailyCount += 1;
    }

    return { allowed: true };
  }
}
