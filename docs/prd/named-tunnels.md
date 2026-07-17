# PRD: Named Cloudflare tunnels for stable hostnames

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
Let an operator run WinReach behind a **named/persistent Cloudflare tunnel** so the public MCP URL is a **stable hostname** they own (e.g. `winreach.example.com`) instead of a random `*.trycloudflare.com` that changes on every restart.

## Problem / motivation
`WINREACH_TUNNEL=cloudflare` today starts a **quick tunnel**: `startCloudflareTunnel` in `src/tunnel.ts` spawns `cloudflared tunnel --url <localUrl>` and scrapes the first `*.trycloudflare.com` URL out of stdout (`parseQuickTunnelUrl`). Cloudflare mints a **new random hostname every launch** — quick tunnels are anonymous, require no account, and are explicitly ephemeral. Anything that pins the MCP endpoint (a Smithery config, a saved `claude mcp add` entry, a client `mcp.json`) breaks the moment WinReach restarts. This has already broken the user's Smithery setup. There is no way today to get a durable address.

## Design principle: operator brings their own tunnel
**WinReach never provides, hosts, or provisions any Cloudflare tunnel.** There is no shared/bundled tunnel and no WinReach-owned Cloudflare account. The operator sets up their **own** named tunnel in their **own** Cloudflare account (their domain, their token); WinReach's only job is to **consume** the supplied `WINREACH_TUNNEL_TOKEN` + hostname and run `cloudflared` with them. The onboarding UI only **guides** the operator through their own setup (an instructions panel linking Cloudflare's tunnel docs plus the exact `cloudflared tunnel create` / `route dns` / `run` commands) and collects the resulting token + hostname. The zero-config quick tunnel stays the default for anyone who doesn't want to set this up.

## Goals
- Support a **named Cloudflare tunnel** that resolves to a **stable, operator-owned hostname**.
- Keep the current **quick tunnel** as the **zero-config default** — no behavior change unless the operator opts in.
- Reuse the existing `cloudflared` resolution/auto-install path (`resolveCloudflaredBinary`).
- Print the stable `mcpUrl` through the same connection-help output `src/server.ts` already emits.

## Non-goals
- Not adding a second tunnel provider (`TunnelProvider` stays `"cloudflare"`).
- Not automating Cloudflare account/zone/tunnel/DNS **provisioning** — the operator creates the tunnel and route out of band (documented as prerequisites below).
- Not changing the TLS posture — tunnel traffic still terminates TLS at Cloudflare and forwards to WinReach over loopback (same warning `src/server.ts` prints today).

## Background: named vs quick tunnels (Cloudflare docs)
Per Cloudflare Tunnel docs, `cloudflared` makes **outbound-only** connections to Cloudflare; a **named tunnel** is a persistent tunnel with a UUID and a fixed public hostname, and it is the supported way to get a stable address. It requires the operator to have a **Cloudflare account with a domain (zone) added to Cloudflare**. Two ways to run one:

- **Remotely-managed (token) — recommended.** Create the tunnel in the Cloudflare dashboard (or API); Cloudflare returns a **tunnel token** (an opaque secret encoding the account + tunnel id + secret). The connector runs with `cloudflared tunnel run --token <TOKEN>` and the **public hostname → service ingress mapping lives in Cloudflare**, so WinReach only needs the token (and, for display, the hostname).
- **Locally-managed (credentials file).** `cloudflared tunnel login` → `cert.pem`; `cloudflared tunnel create <NAME>` → a `<UUID>.json` credentials file; a local `config.yml` maps `hostname → http://127.0.0.1:<port>`; `cloudflared tunnel route dns <NAME> <hostname>` creates the CNAME to `<UUID>.cfargotunnel.com`; run with `cloudflared tunnel run <NAME>`.

Either way there is **no URL to scrape** — the hostname is known ahead of time. This PRD standardizes on the **token** flow (one secret, ingress managed by Cloudflare), matching how WinReach already downloads/manages `cloudflared` for the operator.

### Operator prerequisites (documented, done once, out of band)
1. A Cloudflare account with a **domain (zone) added to Cloudflare**.
2. Create a **named tunnel** (dashboard: Zero Trust → Networks → Tunnels → create; or API) and copy its **tunnel token**.
3. Add a **public hostname** to the tunnel pointing at the WinReach service (`http://127.0.0.1:<port>`), which creates the DNS route (CNAME → `<UUID>.cfargotunnel.com`).
4. Give WinReach the token + hostname via env.

## Approach (grounded in the code)
`src/tunnel.ts` already models a tunnel as: resolve a `cloudflared` binary → spawn it → wait for readiness → return `TunnelHandle { publicUrl, mcpUrl, stop }`. Named mode reuses that shape but changes the argv and how the URL is determined.

1. **Config (`src/config.ts`, `loadTunnelConfig`)** — extend `TunnelConfig` with optional:
   - `token` — `WINREACH_TUNNEL_TOKEN` (the remotely-managed tunnel token; a **secret**).
   - `hostname` — `WINREACH_TUNNEL_HOSTNAME` (the stable public host, e.g. `winreach.example.com`), used to build `publicUrl`/`mcpUrl`.
   - Mode is **inferred**: token + hostname present → named mode; otherwise → quick-tunnel mode (today's default). Keep `provider: "cloudflare"`.
2. **Tunnel start (`src/tunnel.ts`)** — add `startNamedCloudflareTunnel(options)` beside `startCloudflareTunnel`:
   - Spawn `cloudflared tunnel --no-autoupdate run --token <token>` (ingress/hostname is managed in Cloudflare, so no `--url` and no local config needed).
   - Keep `--http-host-header 127.0.0.1` so the MCP SDK's localhost DNS-rebinding host validation still accepts forwarded requests (same reason `startCloudflareTunnel` sets it today).
   - Build `publicUrl = https://<hostname>` and `mcpUrl = buildMcpUrl(publicUrl, endpointPath)` directly from config. Resolve the handle when cloudflared reports **registered/healthy connections** in its output (rather than matching a `trycloudflare.com` URL); keep the existing start-timeout guard and `stop()`.
   - Factor the shared binary-resolution + spawn + timeout scaffolding out of `startCloudflareTunnel` so both modes reuse it.
3. **Dispatch (`src/server.ts`, `startTunnel`)** — choose named vs quick by the inferred mode; the rest of the lifecycle (`stop()` on shutdown, `printConnectionHelp(mcpUrl)`) is unchanged.
4. **Binary resolution** — unchanged; `resolveCloudflaredBinary` already covers explicit path / PATH / cached download / auto-install.
5. **Docs** — README/CONNECT: the operator-prerequisite walkthrough above + the two env vars; SECURITY.md: the token is a secret, never logged.

## Task breakdown
1. Extend `TunnelConfig` + `loadTunnelConfig` with `token`/`hostname` and mode inference; validate that token and hostname are supplied together.
2. Add `startNamedCloudflareTunnel` to `src/tunnel.ts`; factor shared spawn/resolve/timeout logic out of `startCloudflareTunnel`.
3. Wire mode dispatch into `src/server.ts` `startTunnel`; keep quick-tunnel as the default fallback.
4. Unit tests: config parsing + mode inference; `buildMcpUrl` with a fixed hostname; readiness detection from sample cloudflared "registered connection" output (mirroring the `parseQuickTunnelUrl` tests).
5. Docs: operator-prerequisite walkthrough + env-var reference + secret-handling note.

## Acceptance criteria
- With no new env vars set, behavior is **identical to today** (quick tunnel, random hostname).
- With `WINREACH_TUNNEL_TOKEN` + `WINREACH_TUNNEL_HOSTNAME` set, WinReach starts a named tunnel and prints a **stable** `mcpUrl` at `https://<hostname>/mcp` that survives a restart unchanged.
- The forwarded-host-header fix still applies (named-tunnel requests are not rejected by localhost host validation).
- Supplying a token without a hostname (or vice-versa) fails fast with a clear error.
- The tunnel token is documented as a secret and never written to logs.

## Open questions
1. **Confirm the run flavor:** standardize on the **remotely-managed token** flow (`--token`, one secret, ingress managed in Cloudflare — this PRD's proposal), or also support the **locally-managed credentials-file + `config.yml`** flow for operators who prefer it? (Prerequisite either way: the operator brings their own Cloudflare account, a domain/zone on Cloudflare, a created named tunnel, and a DNS route.)
2. Config-mode signal: infer named-vs-quick purely from presence of `token`+`hostname` (proposed), or add an explicit `WINREACH_TUNNEL_MODE=named|quick`?
3. Should WinReach validate the hostname against what the token actually serves, or trust the operator's `WINREACH_TUNNEL_HOSTNAME` as display-only?
