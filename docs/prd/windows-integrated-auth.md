# PRD: Windows Integrated Auth (Negotiate/NTLM) via reverse proxy

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
Let WinReach accept **Windows Integrated Authentication (Negotiate/NTLM/Kerberos)** identities **without a native dependency** — by trusting an authenticated-identity header from a **reverse proxy (IIS/nginx)** that performs the Negotiate handshake — mapping the authenticated Windows user to a WinReach principal. This is the hardest / most-uncertain roadmap item; a well-scoped "defer" is an acceptable outcome.

## Problem / motivation
SECURITY.md lists this under **Not Yet Implemented**: "Request-level Windows Integrated Authentication (Negotiate/NTLM/Kerberos over HTTP). This needs native SSPI bindings; request auth is handled by bearer tokens and, optionally, mTLS client certificates." WinReach authenticates every request with a **bearer token** — `createPrincipalAuthMiddleware` in `src/auth.ts` extracts the token and `resolvePrincipal` maps it to a `Principal`. In a Windows/AD shop, operators would rather agents authenticate as their **domain identity** (Negotiate) than manage bearer tokens. But doing Negotiate **in-process** requires **SSPI** — a native Node addon — which directly violates WinReach's **no-native-dependencies** rule (the same rule that shaped every other feature: pure-JS/WASM only, clean `npm install`, no prebuilt-binary install risk on Windows).

## Goals
- Give AD operators a **supported path** to Windows Integrated Auth **without adding any native dependency to WinReach core**.
- Reuse the existing principal model — a proxy-authenticated Windows user maps to a `Principal` (name/role/policy/tools) so all downstream gating/audit is unchanged.
- Be **honest about the tradeoffs** and recommend the lowest-risk path.

## Non-goals
- **No in-process SSPI / native SSPI bindings.** An optional native module is explicitly **out of scope** — it fights the no-native-deps rule, adds a Windows build/install failure surface, and is not worth the risk for this feature. Documented as a rejected option below, not a deliverable.
- Not implementing the Negotiate/Kerberos protocol inside WinReach.
- Not replacing bearer/mTLS auth — this is an additional, opt-in front-door for AD environments.

## Approach (grounded in the code)
WinReach already terminates or fronts nothing about identity beyond the bearer check in `src/auth.ts`, and SECURITY.md already recommends running behind "a reverse proxy with TLS." The realistic paths:

### Options evaluated
| Option | How | Native dep? | Verdict |
|---|---|---|---|
| **(a) Optional native SSPI module** | In-process Negotiate via a Node SSPI addon, kept out of core | **Yes** | **Rejected** — violates the no-native-deps rule; Windows build/prebuild risk; maintenance burden. |
| **(b) Reverse-proxy Negotiate + trusted identity header** | IIS (Windows Auth) or nginx does the Negotiate/NTLM handshake, then forwards the authenticated user in a header WinReach trusts | **No** | **Recommended** — zero native deps; IIS does Windows Auth natively; identity mapping is a small, pure-TS middleware. |
| **(c) Defer** | Keep bearer + mTLS; document the proxy pattern as guidance only | **No** | Acceptable fallback — mTLS already covers strong request auth for internet-facing instances. |

### Recommended: (b) reverse-proxy pattern
- The operator fronts WinReach with **IIS** (Windows Authentication enabled — IIS speaks Negotiate/NTLM/Kerberos natively) or **nginx with an auth module**. The proxy performs the handshake and injects the authenticated principal into a header, e.g. `X-WinReach-User: DOMAIN\\alice` (IIS: the authenticated user; a `web.config`/URL-rewrite rule sets the header).
- A new **trusted-header auth middleware** in `src/auth.ts` (parallel to `createPrincipalAuthMiddleware`) reads that header **only when the connection comes from a trusted proxy** and maps the Windows user → a WinReach `Principal` via an operator-supplied mapping (`WINREACH_WINDOWS_AUTH_MAP`, e.g. `{ "DOMAIN\\alice": "<principal-name-or-role>" }`), stashing the resolved principal on `res.locals.principal` exactly like the bearer path so `getRequestPrincipal` and every tool gate work unchanged.
- **Trust boundary (critical):** the identity header must be **unspoofable**. WinReach must (1) bind to loopback / a private interface only reachable by the proxy, (2) require a shared secret / mTLS between proxy and WinReach, and (3) **strip any client-supplied** `X-WinReach-User` before the proxy sets it. Without this, anyone who can reach the port can impersonate any user. This is the whole risk of the pattern and must be documented loudly.

## Task breakdown (recommended path)
1. Config: `WINREACH_WINDOWS_AUTH_ENABLED`, the trusted identity header name, the trusted-proxy source (loopback/CIDR) and proxy shared-secret/mTLS requirement, and `WINREACH_WINDOWS_AUTH_MAP` (Windows user → principal/role).
2. `createWindowsAuthMiddleware` in `src/auth.ts`: verify request came from the trusted proxy, read + validate the identity header, map to a `Principal`, reject if unmapped; set `res.locals.principal`.
3. Wire it as an alternative front-door in `src/mcpServer.ts` (bearer stays the default; Windows auth is opt-in and mutually exclusive per endpoint).
4. Reference deployment docs: an **IIS** `web.config` (Windows Auth + header injection + WinReach on loopback) and an **nginx** equivalent, with the trust-boundary hardening spelled out.
5. Tests: trusted-proxy source enforced; client-supplied identity header ignored/stripped; unmapped user rejected; mapped user resolves to the right principal.
6. SECURITY.md: move the line out of "Not Yet Implemented"; document the pattern + trust boundary; state that in-process SSPI is intentionally not supported.

## Acceptance criteria
- With Windows auth disabled (default), behavior is unchanged (bearer + optional mTLS).
- Behind a correctly configured IIS/nginx proxy, a Negotiate-authenticated Windows user reaches WinReach and is mapped to the intended principal, with all command policy / tool gating / audit applied under that identity.
- A **client-supplied** identity header on a direct (non-proxy) connection is **never trusted** — the request is rejected.
- **No native dependency** is added to WinReach; `npm install` stays clean.
- SECURITY.md documents the pattern, the trust boundary, and the deliberate exclusion of in-process SSPI.

## Open questions
1. **Confirmed direction:** reverse-proxy pattern (or defer) — **native SSPI is out of scope**. Do we build the reverse-proxy trusted-header middleware **now**, or **defer** and ship only documentation of the pattern (relying on existing bearer + mTLS) until there's concrete demand?
2. Which proxy do we document as the **primary** reference — **IIS** (native Windows Auth, most natural on Windows Server) or **nginx**?
3. Identity mapping: an explicit `WINREACH_WINDOWS_AUTH_MAP` (Windows user → principal), or a convention (e.g. map the AD group/role to a WinReach role)?
4. Proxy↔WinReach trust: is **loopback-only + a shared secret header** enough, or should we require **mTLS between the proxy and WinReach** as the supported hardening?
