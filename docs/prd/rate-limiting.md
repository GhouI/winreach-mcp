# PRD: Rate limiting + per-principal quotas

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
Generalize the per-principal rate limiter that today only guards `computer_use` into a **server-wide throttle for every tool call** — a requests-per-window cap plus an optional daily quota, configurable globally and per-principal — so a runaway or abusive agent is bounded, throttled cleanly, and audited as `blocked`.

## Problem / motivation
SECURITY.md lists "Rate limiting / per-principal quotas" under **Not Yet Implemented**. The only limiter that exists is `createRateLimiter` in `src/tools/computer-use.ts`: a token bucket, one instance per principal-server, that caps `computer_use` actions/second. Every other tool — `powershell_execute`, `powershell_send`, `file_upload`, `file_download`, `take_screenshot` — is **unbounded**. A compromised or looping agent can hammer PowerShell or drive large file transfers with nothing but the command policy in the way. The setup-web app already has a fixed-window `rateLimit` in `setup-web/lib/http-guard.ts`, but that guards the config UI, not the MCP runtime.

## Goals
- A **per-principal** requests-per-window limit applied to **all** tool calls (not just `computer_use`).
- An optional **per-principal daily quota** (total calls per rolling 24h / calendar day).
- Configurable **globally** (a default for every principal) and **overridable per-principal** by extending the `WINREACH_PRINCIPALS` / `WINREACH_ROLES` schema.
- A clean throttle error returned to the agent (so it can back off), and an audit record with `decision: "blocked"`, `reason: "rate limited"` / `"quota exceeded"`.
- Reuse the existing **token-bucket** approach; keep it in-memory and per-process (consistent with the current design and the http-guard note).

## Non-goals
- Not a distributed/multi-instance limiter (in-memory per-process, like both existing limiters — document that a proxy is needed for horizontal scaling).
- Not a byte/bandwidth quota (this is call-count; file-size is already bounded by `WINREACH_MAX_FILE_BYTES`).
- Not replacing the `computer_use` actions/sec cap — that stays as a finer-grained inner limit; the new limiter sits in front of all tools.

## Approach (grounded in the code)
Every tool call flows through a child in `src/tools/`, and each principal gets a **fresh `McpServer` per request** via `createWinReachMcpServer` in `src/mcpServer.ts`. That matters: the current `createRateLimiter` closes over a bucket created **per server instance**, so its state does not actually persist across requests — it only bounds a burst within one connection. A real per-principal limit needs a **process-lifetime store keyed by principal**, created once and shared across requests.

1. **Shared limiter store (new, e.g. `src/rateLimit.ts`)** — a module-level `Map<principalName, { bucket, dailyCount, dayResetAt }>`, created once at app startup (alongside `sessions`/`audit` in `createWinReachApp`) and passed into `ToolContext`. Generalize the token-bucket from `computer-use.ts` (refill = `rate * elapsed`), plus a fixed-window daily counter modeled on `http-guard.ts`'s `rateLimit` (count + `resetAt`, self-expiring).
2. **Config (`src/config.ts`)** — a `RateLimitConfig` with global defaults:
   - `WINREACH_RATE_LIMIT_PER_MIN` (requests/window; window configurable or fixed at 60s) — `0`/unset = disabled (opt-in, no behavior change by default).
   - `WINREACH_RATE_LIMIT_DAILY_QUOTA` (calls/day) — `0`/unset = no quota.
3. **Per-principal override (`src/principals.ts`, `src/roles.ts`)** — extend `RawPrincipal` / `RoleDefinition` with optional `rateLimitPerMin` and `dailyQuota`, inherited from role and overridable on the principal exactly like `tools`/`allow`/`deny` already are (`parsePrincipals` merge logic).
4. **Enforcement (`src/tools/helpers.ts`)** — add a `checkRateLimit(ctx, tool)` guard that runs at the **top of every tool handler** (or is folded into a small wrapper in `registerTools`), before `enforcePolicy`. On refusal: audit `{ decision: "blocked", reason: "rate limited" | "quota exceeded", tool }` (the `AuditEntry.decision` union already includes `"blocked"`) and return a structured MCP error like the existing `{ blocked: true, reason }` shape. The `computer_use` inner actions/sec cap remains.
5. **Docs** — SECURITY.md: move the line out of "Not Yet Implemented" into the controls table; document the env vars and per-principal fields.

## Task breakdown
1. New shared limiter module (token bucket + daily fixed-window counter), unit-tested for refill, window rollover, and quota reset.
2. `RateLimitConfig` in `src/config.ts` with global env defaults (disabled unless set).
3. Extend principal/role schemas with `rateLimitPerMin` / `dailyQuota` + inheritance/merge, with parse tests.
4. Thread the limiter store through `createWinReachApp` → `ToolContext`; add `checkRateLimit` guard and apply it to every tool family (or a shared registration wrapper).
5. Audit + clean throttle error; tests asserting a blocked call is audited and the tool did not execute.
6. SECURITY.md + README updates.

## Acceptance criteria
- With no rate-limit env/principal config set, behavior is unchanged (limiter disabled).
- With a global per-minute limit set, a principal exceeding it gets a throttle error on the next call and the underlying tool does **not** run.
- A per-principal override (via principal or role) takes precedence over the global default.
- Exceeding a daily quota blocks further calls until the window resets.
- Every throttled/quota-exceeded call is audited with `decision: "blocked"` and a distinguishing `reason`.
- Limits are **per principal** — one principal being throttled never affects another.

## Open questions
1. Window shape — a **fixed window** (simpler, matches `http-guard.ts`) or the **rolling token bucket** (smoother, matches `computer_use`) for the per-minute limit? (Proposed: token bucket for the rate, fixed window for the daily quota.)
2. Daily quota reset — **rolling 24h** from first call, or **calendar day** in a fixed timezone (e.g. UTC)?
3. Should the throttle error include a `retryAfter` hint so well-behaved agents can back off precisely?
4. Do we also want a coarse **per-IP / global** limit in front of auth (like the setup-web guard), or is per-principal (post-auth) sufficient given bearer auth is required first?
