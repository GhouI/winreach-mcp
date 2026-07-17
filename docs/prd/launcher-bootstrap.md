# PRD: One-command launcher / bootstrap script

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
A tiny **launcher script** — `start-winreach.ps1` (Windows/PowerShell) and `start-winreach.sh` (Git Bash) — that ensures WinReach is available, starts the MCP server, and **opens the onboarding web UI when setup isn't complete yet** (otherwise just runs), installable via a one-line bootstrap.

## Problem / motivation
Getting WinReach running still takes several manual steps: have Node, know the `npx winreach-mcp` invocation, know the env vars, and separately start the `setup-web` onboarding UI to generate keys/config. Most of WinReach's real UX is **web-controlling an MCP server** — the setup-web app defines principals, roles, gates, and env — so the natural "package" is not a binary, it's **a script that boots the server plus onboarding**. There's no such entry point today: the only CI is `.github/workflows/ci.yml` (typecheck + test), there is no release, and nothing ties "start the server" to "finish setup if you haven't."

## Goals
- **One command** to go from nothing to a running WinReach: `start-winreach.ps1` / `start-winreach.sh`.
- The script **ensures WinReach is available** (via `npx winreach-mcp`, or fetching a pinned version) — no manual clone/build.
- The script **starts the MCP server**.
- If the operator **hasn't completed setup**, it **opens the onboarding web UI**; if setup is already done, it just runs the server.
- Distributable via a **GitHub release** + a **one-line bootstrap**: `irm <url> | iex` (PowerShell), `curl -fsSL <url> | bash` (Git Bash).

## Non-goals
- **Not** a single-file executable, SEA, or MSI/NSIS installer. The deliverable is a script, not a binary.
- Not replacing npm — `winreach-mcp` on npm stays the runtime; the script wraps it.
- Not auto-updating a running server — re-running the bootstrap pulls the newest version.
- Not a new config system — the script sets/forwards the existing `WINREACH_*` env the server already reads (`src/config.ts`).

## Approach (grounded in the code)
The pieces already exist and just need an orchestrator:
- The server entry is `dist/src/cli.js` (`package.json` `bin: winreach-mcp`), runnable as `npx winreach-mcp`; `src/server.ts` prints connection help and handles tunnel/shutdown.
- Onboarding is the **`setup-web` Next.js app** (`setup-web/package.json`: `next dev` / `next build` + `next start`) — it's what produces principals/roles/gates as `WINREACH_*` env.
- `start-headless.ps1` already exists at the repo root as a precedent for a PowerShell launcher.
- Config is entirely env-driven (`readEnv("WINREACH_…")`), so the launcher's job is: resolve the binary, decide setup-complete vs not, then either open onboarding or run the server with the operator's env.

**"Setup complete" signal.** The launcher needs a cheap, local check for whether onboarding has produced a config. Options: presence of a saved env/config file the onboarding UI writes (e.g. `~/.winreach/winreach.env`), or the absence of any principal (`WINREACH_TOKEN` / `WINREACH_PRINCIPALS` unset — the server currently *errors* without one, per `loadPrincipals`). Proposed: onboarding writes a config file on completion; the launcher treats "config file present" as setup-complete, "absent" as first-run → open the UI.

**Flow (both scripts, same logic):**
1. Ensure a runnable WinReach: check for `npx`/Node; run `npx -y winreach-mcp@<pinned>` (or fetch the release payload) — surface a clear message if Node is missing, with the install link.
2. Determine setup state via the config-file check above.
3. **First run:** start the `setup-web` onboarding UI (or open its hosted/local URL), point the operator at it, wait for them to finish (config file appears), then continue.
4. **Setup done:** load the saved env and exec the server (`npx winreach-mcp`), forwarding args/env; print the same connection help.
5. `start-winreach.ps1` = PowerShell (reuse/extend `start-headless.ps1` patterns); `start-winreach.sh` = Git Bash equivalent.

**Distribution:** attach both scripts to a GitHub release; publish two short bootstrap one-liners in the README that download and run the appropriate script (`irm … | iex`, `curl -fsSL … | bash`). Pin the bootstrap to a release tag; document the SHA-256 so operators can verify before piping to a shell.

## Task breakdown
1. Define the **setup-complete contract**: what file the onboarding UI writes on completion and where (e.g. `~/.winreach/winreach.env`), and how the launcher loads it into env.
2. `start-winreach.ps1`: ensure-available → setup check → open onboarding or run server; reuse `start-headless.ps1` where possible.
3. `start-winreach.sh`: the Git Bash equivalent with the same flow.
4. Small onboarding-UI change (if needed) so completion **writes the config file** the launcher keys on.
5. **Release workflow** (`.github/workflows/release.yml`) on `v*` tags: attach both scripts + publish checksums.
6. README: the two one-line bootstrap commands + a "what it does / how to verify before piping to a shell" note.

## Acceptance criteria
- Running `start-winreach.ps1` (or `.sh`) on a machine with Node installed goes from nothing to a running server with no manual `npx`/env fiddling.
- On **first run** (no saved config), the launcher opens the onboarding UI; after the operator completes setup, the server starts using that config.
- On a **subsequent run** (config present), the launcher **skips onboarding** and starts the server directly.
- The one-line bootstrap (`irm … | iex` / `curl … | bash`) fetches and runs the launcher from a tagged GitHub release.
- If Node is missing, the launcher fails with a clear, actionable message (not a stack trace).

## Open questions
1. **Setup-complete signal:** a config file the onboarding UI writes (proposed) vs. inferring from whether `WINREACH_TOKEN`/`WINREACH_PRINCIPALS` are set in the environment? Where should the saved config live (`~/.winreach/winreach.env`)?
2. Onboarding UI delivery from the launcher: run `setup-web` **locally** (needs the Next app present/built) or point at a **hosted** onboarding URL? (Local keeps everything offline; hosted avoids shipping the Next app in the bootstrap.)
3. Pipe-to-shell safety: publish checksums and recommend "download, inspect, then run" alongside the convenience one-liner — how prominent should the warning be?
