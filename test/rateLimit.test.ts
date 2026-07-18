import { describe, expect, it } from "vitest";
import { RateLimiterStore, effectiveRateLimits, type EffectiveRateLimits } from "../src/rateLimit.js";
import type { AppConfig } from "../src/config.js";
import type { Principal } from "../src/principals.js";

/** A store whose clock is a mutable variable the test advances by hand. */
function fakeClock(startMs: number) {
  const clock = { now: startMs };
  const store = new RateLimiterStore(() => clock.now);
  const advance = (ms: number) => {
    clock.now += ms;
  };
  return { store, advance, clock };
}

const limits = (perMin: number, dailyQuota: number): EffectiveRateLimits => ({ perMin, dailyQuota });

// 2026-07-18T10:00:00Z — a fixed instant well inside a UTC day.
const T0 = Date.UTC(2026, 6, 18, 10, 0, 0);

describe("RateLimiterStore per-minute token bucket", () => {
  it("allows a burst up to the bucket, then throttles with a retryAfter hint", () => {
    const { store } = fakeClock(T0);
    const l = limits(60, 0); // capacity 60, refills 1 token/sec

    for (let i = 0; i < 60; i++) {
      expect(store.check("alice", l).allowed).toBe(true);
    }

    const blocked = store.check("alice", l);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe("rate limited");
      expect(blocked.retryAfter).toBe(1); // ~1s to refill one token at 1/sec
    }
  });

  it("refills over time so a throttled principal recovers", () => {
    const { store, advance } = fakeClock(T0);
    const l = limits(60, 0);

    for (let i = 0; i < 60; i++) {
      store.check("bob", l);
    }
    expect(store.check("bob", l).allowed).toBe(false);

    advance(1000); // one second -> one token back
    expect(store.check("bob", l).allowed).toBe(true);
    // ...and that single token is spent again.
    expect(store.check("bob", l).allowed).toBe(false);
  });

  it("keeps each principal's budget independent", () => {
    const { store } = fakeClock(T0);
    const l = limits(1, 0);

    expect(store.check("p1", l).allowed).toBe(true);
    expect(store.check("p1", l).allowed).toBe(false); // p1 exhausted
    expect(store.check("p2", l).allowed).toBe(true); // p2 unaffected
  });
});

describe("RateLimiterStore daily quota (fixed window, UTC midnight)", () => {
  it("blocks once the quota is spent and resets at the next UTC midnight", () => {
    const { store, clock, advance } = fakeClock(T0);
    const l = limits(0, 3); // no per-minute cap, 3 calls/day

    expect(store.check("q", l).allowed).toBe(true);
    expect(store.check("q", l).allowed).toBe(true);
    expect(store.check("q", l).allowed).toBe(true);

    const blocked = store.check("q", l);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toBe("quota exceeded");
      const secondsToMidnight = Math.ceil((Date.UTC(2026, 6, 19) - clock.now) / 1000);
      expect(blocked.retryAfter).toBe(secondsToMidnight);
    }

    // Cross into the next UTC day: the window resets.
    advance(Date.UTC(2026, 6, 19, 0, 0, 1) - clock.now);
    expect(store.check("q", l).allowed).toBe(true);
  });

  it("does not charge the quota for a call the per-minute bucket rejects", () => {
    const { store, advance } = fakeClock(T0);
    const l = limits(1, 2); // capacity 1 token, quota 2/day

    expect(store.check("c", l).allowed).toBe(true); // token spent, quota 1/2
    expect(store.check("c", l).allowed).toBe(false); // rate limited (must NOT burn quota)
    expect(store.check("c", l).allowed).toBe(false); // still rate limited

    advance(60_000); // refill the bucket
    // If the two rejected calls had each burned quota, quota (2) would already be
    // spent and this would be "quota exceeded". It is allowed -> quota untouched.
    expect(store.check("c", l).allowed).toBe(true); // quota now 2/2
    expect(store.check("c", l).allowed).toBe(false); // now genuinely over quota
  });
});

describe("RateLimiterStore disabled", () => {
  it("is a no-op when both dimensions are zero", () => {
    const { store } = fakeClock(T0);
    for (let i = 0; i < 1000; i++) {
      expect(store.check("x", limits(0, 0)).allowed).toBe(true);
    }
  });
});

describe("effectiveRateLimits", () => {
  const config = { rateLimit: { perMin: 30, dailyQuota: 500 } } as AppConfig;
  const principal = (over: Partial<Principal>): Principal => ({
    name: "p",
    role: "user",
    token: "t",
    policy: { allow: [], deny: [] },
    ...over
  });

  it("falls back to the global defaults when the principal sets nothing", () => {
    expect(effectiveRateLimits(config, principal({}))).toEqual({ perMin: 30, dailyQuota: 500 });
  });

  it("lets the principal override either dimension", () => {
    expect(effectiveRateLimits(config, principal({ rateLimitPerMin: 5 }))).toEqual({
      perMin: 5,
      dailyQuota: 500
    });
    expect(effectiveRateLimits(config, principal({ dailyQuota: 10 }))).toEqual({
      perMin: 30,
      dailyQuota: 10
    });
  });

  it("treats an explicit 0 on the principal as a real opt-out", () => {
    expect(effectiveRateLimits(config, principal({ rateLimitPerMin: 0, dailyQuota: 0 }))).toEqual({
      perMin: 0,
      dailyQuota: 0
    });
  });
});
