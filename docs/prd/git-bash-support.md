# PRD: Git Bash support (dedicated bash tool family)

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
Add a **dedicated Git Bash tool family** — `bash_execute`, `bash_open_session`, `bash_send`, `bash_close_session`, `bash_list_sessions` — a sibling to the PowerShell tools, so agents can run bash/`sh` on Windows under the **same command policy, gating, and audit**.

## Problem / motivation
WinReach's execution layer is **PowerShell-only**. `resolveShellPath` in `src/powershell/shell.ts` returns `powershell.exe` (or `pwsh`); both one-shot execution (`executePowerShell`) and the persistent session (`PowerShellSession` in `src/powershell/session.ts`) spawn PowerShell with `-NoProfile -NonInteractive -Command …`, and the session bootstrap base64-encodes each command and drives it through `Invoke-Expression` with a PowerShell exit-code marker (`formatSessionCommand`). Agents fluent in bash — or that need `.sh` scripts and the POSIX tools shipped with Git for Windows — have no path. `WINREACH_SHELL_PATH` only swaps *which PowerShell-like* binary is spawned; the hardcoded argv and session marker protocol are PowerShell semantics, so pointing it at `bash.exe` would not work.

## Goals
- A full **bash tool family** mirroring the PowerShell one: one-shot `bash_execute` plus the persistent-session lifecycle (`bash_open_session` / `bash_send` / `bash_close_session` / `bash_list_sessions`).
- Target **Git Bash's `bash.exe`** (auto-detect common install paths, with a `WINREACH_BASH_PATH` override).
- Enforce the **same command allow/deny policy**, per-principal `tools` allowlist, and **audit** the PowerShell tools already use (`enforcePolicy` / `auditResult` in `src/tools/helpers.ts`, `allowsTool` gating).
- Opt-in and discoverable — only offered when `bash.exe` is available/enabled and the principal is allowed.

## Non-goals
- Not removing or de-prioritizing PowerShell — it remains the default; bash is additive.
- Not bundling Git for Windows — the operator provides `bash.exe`; WinReach resolves/validates a path.
- Not a POSIX abstraction layer — commands are passed to bash as-is; the agent owns bash syntax.

## Approach (grounded in the code)
The tools layer already composes independent families: `src/tools/index.ts` calls `registerPowerShellTools`, `registerScreenshotTools`, etc., each deciding for itself whether it's exposed (per `allowsTool` and operator gates). The bash family is **one new child module** plus one line in `index.ts`. Command policy is shell-agnostic — `enforcePolicy` runs the command string through `evaluatePolicies`, so it applies unchanged to bash.

The execution primitives generalize cleanly:

1. **Shell resolution** — add `resolveBashPath(configured?)` mirroring `resolveShellPath`: honor `WINREACH_BASH_PATH`, else auto-detect Git Bash at common install paths (`C:\Program Files\Git\bin\bash.exe`, `C:\Program Files\Git\usr\bin\bash.exe`, `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`), else report unavailable so the family isn't registered.
2. **One-shot (`bash_execute`)** — generalize `executePowerShell` into a shell-agnostic runner (or a `src/bash/shell.ts` parallel to `src/powershell/shell.ts`) that spawns `bash -lc "<command>"`, reusing the existing `createOutputBuffer`, timeout, `maxOutputBytes`, cwd/env handling — none of which is PowerShell-specific.
3. **Persistent sessions** — a `BashSession` / `BashSessionManager` parallel to `PowerShellSessionManager`. The pattern from `session.ts` carries over: bootstrap a long-lived `bash` reading commands from stdin, run each, and emit a **unique end marker with the exit code** (`echo "__WINREACH_END_<id>__:exit=$?"`) so the manager can frame output and capture `$?` — the bash analogue of `formatSessionCommand`. Reuse the queueing, timeout, and marker-scan logic verbatim; only the shell-side bootstrap string differs.
4. **Config (`src/config.ts`)** — `WINREACH_BASH_PATH` (explicit path), and an enable flag if bash should be off by default even when detected. Bash session runtime reuses the same `defaultCwd` / `defaultTimeoutMs` / `maxOutputBytes` from `AppConfig`.
5. **Registration (`src/tools/bash.ts` + `src/tools/index.ts`)** — register each bash tool under `allowsTool("bash_execute")` etc., wrap command-running tools in `enforcePolicy(...)` and `auditResult(...)` exactly like `powershell.ts`. Sessions are tracked in a bash session manager threaded through `ToolContext` alongside the PowerShell `sessions`.

## Task breakdown
1. `resolveBashPath` + auto-detection + `WINREACH_BASH_PATH` config; report availability so registration can no-op when bash is absent.
2. Shell-agnostic one-shot runner (or `src/bash/shell.ts`); `bash_execute` tool child with policy + audit + allowlist gating.
3. `BashSession` / `BashSessionManager` (bash end-marker + exit-code protocol) reusing `session.ts` structure; thread through `ToolContext`.
4. `bash_open_session` / `bash_send` / `bash_close_session` / `bash_list_sessions` tools, gated + audited like their PowerShell siblings.
5. Register the family in `src/tools/index.ts`.
6. Tests: policy blocks a denied command run via bash (audited `blocked`); one-shot + session round-trips return stdout/stderr/exit code bounded by timeout/output caps; family is hidden when bash is unavailable or not in the principal's allowlist.
7. Docs: README/CONNECT tool list + SECURITY.md note that bash is not a policy bypass.

## Acceptance criteria
- An allowed principal can run POSIX commands via `bash_execute` and drive a persistent bash session (`open`/`send`/`close`/`list`), with stdout/stderr/exit code bounded by the same timeout and output cap as PowerShell.
- The **command allow/deny policy blocks a denied command run through bash**, audited as `blocked` — bash is not a policy bypass.
- PowerShell behavior is completely unchanged.
- The bash family is only offered when `bash.exe` is resolvable/enabled and the principal's `tools` allowlist permits each tool.
- Every bash call is audited with the right `tool` name (`bash_execute`, `bash_send`, …).

## Open questions
1. Should the bash family be **on whenever `bash.exe` is detected**, or **off until explicitly enabled** (e.g. `WINREACH_ALLOW_BASH`), consistent with the opt-in posture of screenshot/computer-use?
2. Auto-detect Git Bash from the common install paths (proposed), or require an explicit `WINREACH_BASH_PATH` with no auto-discovery?
3. `bash -lc` (login shell, sources profile — more PATH/tooling available, slightly slower) vs `bash -c` (leaner, more predictable) for command invocation?
