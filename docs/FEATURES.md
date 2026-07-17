# WinReach Features

WinReach is a TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server that turns a
Windows host into a headless PowerShell target for AI agents. Agents connect over Streamable HTTP and call
tools instead of driving RDP, screenshots, or a human-owned terminal window.

```text
Agent or MCP client  ->  WinReach MCP over HTTP  ->  Windows PowerShell
```

This document explains the main features of WinReach as they exist in the source tree. For step-by-step
install and agent-connection instructions see [Install WinReach and Connect Agents](INSTALL_AND_AGENT_USAGE.md);
for the security control matrix see [SECURITY.md](../SECURITY.md); for the full configuration table see the
[README](../README.md#configuration).

## Contents

- [PowerShell tools](#powershell-tools)
- [Structured command results](#structured-command-results)
- [One-shot vs persistent sessions](#one-shot-vs-persistent-sessions)
- [Transport and endpoint](#transport-and-endpoint)
- [Security model](#security-model)
  - [Per-principal authentication](#per-principal-authentication)
  - [Command allow/deny policy](#command-allowdeny-policy)
  - [In-app TLS and mutual TLS](#in-app-tls-and-mutual-tls)
  - [Audit logging](#audit-logging)
  - [Origin guard and DNS-rebinding protection](#origin-guard-and-dns-rebinding-protection)
- [Public access with a Cloudflare tunnel](#public-access-with-a-cloudflare-tunnel)
- [Configuration](#configuration)
- [Windows service installation](#windows-service-installation)
- [Diagnostic client and multi-target support](#diagnostic-client-and-multi-target-support)

## PowerShell tools

WinReach exposes five MCP tools. Each tool is registered on every request in
[`src/mcpServer.ts`](../src/mcpServer.ts), and PowerShell processes are spawned with
`-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass`.

| Tool | Purpose | Key inputs |
| --- | --- | --- |
| `powershell_execute` | Run one isolated, one-shot PowerShell command in a fresh process. | `command` (required), `cwd`, `env`, `timeoutMs`, `maxOutputBytes` |
| `powershell_open_session` | Start a persistent PowerShell process and return its `sessionId`. | `cwd`, `env` |
| `powershell_send` | Send a command to an existing persistent session. | `sessionId` (required), `command` (required), plus the same optional inputs as `powershell_execute` |
| `powershell_close_session` | Close a persistent session and release its process. | `sessionId` (required) |
| `powershell_list_sessions` | List active persistent sessions. | none |

Command details:

- `command` is a PowerShell command string (required, non-empty).
- `cwd` overrides the working directory for that call (default: `WINREACH_CWD`, else the server process cwd).
- `env` supplies extra environment variables merged over the server's environment.
- `timeoutMs` bounds how long the command may run before it is killed (default: `WINREACH_TIMEOUT_MS`, `30000`).
- `maxOutputBytes` caps the bytes captured **per stream** (default: `WINREACH_MAX_OUTPUT_BYTES`, `1048576`).

The MCP server also advertises `instructions` to connected clients describing when to use one-shot execution
versus persistent sessions, and reminding agents that every call is remote command execution running as the
OS user that launched WinReach.

## Structured command results

`powershell_execute` and `powershell_send` return a structured JSON result (defined in
[`src/powershell/types.ts`](../src/powershell/types.ts)) as the tool's text content:

```json
{
  "commandId": "uuid",
  "stdout": "hello\r\n",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 143,
  "truncated": false
}
```

- `commandId` — a per-command UUID.
- `stdout` / `stderr` — captured output for each stream.
- `exitCode` — the process exit code, or `null` when the command timed out.
- `durationMs` — wall-clock duration.
- `truncated` — `true` when either stream hit `maxOutputBytes` and capture stopped. Output is captured up to
  the byte cap and then dropped, so a `truncated: true` result is partial by design.

The other tools return their own JSON shapes: `powershell_open_session` and `powershell_list_sessions` return
`SessionInfo` objects (`sessionId`, `createdAt`, `lastUsedAt`, `cwd`), and `powershell_close_session` returns
`{ "sessionId", "closed" }`.

## One-shot vs persistent sessions

**One-shot (`powershell_execute`)** spawns a brand-new PowerShell process per call
([`src/powershell/shell.ts`](../src/powershell/shell.ts)). Nothing carries over between calls — no variables,
no imported modules, no working-directory changes. Use it for the majority of commands.

**Persistent sessions** keep a single long-lived PowerShell process so state survives across commands
([`src/powershell/session.ts`](../src/powershell/session.ts)). Open a session, send commands to it by
`sessionId`, then close it:

1. `powershell_open_session` — spawns the process (optionally with a `cwd` and `env`) and returns a `sessionId`.
2. `powershell_send` — runs a command inside that process. Variables, imported modules, and the current
   directory persist between sends.
3. `powershell_close_session` — terminates the process.

Session mechanics worth knowing:

- Commands are sent to the session's stdin base64-encoded and executed via a bootstrap read loop, with a
  unique end-marker used to detect completion and parse the exit code.
- Commands on a single session are **serialized**: a second `powershell_send` queues until the first finishes.
- A command that exceeds its timeout appends a timeout message, resolves the pending result with a `null`
  exit code, and **closes the session** — a timed-out session cannot be reused.
- Sessions live in memory in a `PowerShellSessionManager`; on shutdown (SIGINT/SIGTERM) the server closes all
  open sessions.

## Transport and endpoint

WinReach is a standalone Node HTTP server (no IIS). It uses the MCP SDK's Express integration
(`createMcpExpressApp`) and the **Streamable HTTP** transport
(`StreamableHTTPServerTransport`), wired up in [`src/mcpServer.ts`](../src/mcpServer.ts).

- The MCP endpoint path defaults to `/mcp` (configurable via `WINREACH_ENDPOINT_PATH`).
- Only **POST** is accepted at the endpoint. `GET` and `DELETE` return HTTP `405 Method not allowed` as a
  JSON-RPC error.
- The transport is created with `sessionIdGenerator: undefined`, so requests are handled statelessly at the
  transport layer (WinReach tracks PowerShell sessions itself, independently of MCP transport sessions).
- The default bind is `http://127.0.0.1:7573/mcp` (`WINREACH_HOST`, `WINREACH_PORT`).

## Security model

WinReach executes arbitrary PowerShell after authentication, so a valid token is equivalent to command
execution as the user running the server. The controls below reduce, but do not eliminate, that risk. See
[SECURITY.md](../SECURITY.md) for the full control matrix and what is out of scope.

### Per-principal authentication

Every request to the MCP endpoint must present a bearer token
(`Authorization: Bearer <token>`); the auth middleware lives in [`src/auth.ts`](../src/auth.ts) and identity
resolution in [`src/principals.ts`](../src/principals.ts).

- **Single admin token** — set `WINREACH_TOKEN`. This becomes one implicit full-access principal named
  `default` with role `admin` and no per-principal command restrictions.
- **Multiple principals** — set `WINREACH_PRINCIPALS` to a JSON array. Each entry has a `name`, a `role`, a
  token (inline `token` or, preferably, `tokenEnv` naming an environment variable), optional per-principal
  `allow`/`deny` regex lists, and an optional `tools` allowlist that limits the principal to specific MCP tools
  (omit `tools` for full access; a tool not in the list is never registered for that principal):

  ```json
  [
    { "name": "ci",    "role": "admin",    "tokenEnv": "CI_TOKEN" },
    { "name": "agent", "role": "readonly", "tokenEnv": "AGENT_TOKEN",
      "allow": ["^Get-", "^Test-"], "deny": ["Remove-Item", "Stop-Service"],
      "tools": ["powershell_execute"] }
  ]
  ```

You can combine both: `WINREACH_TOKEN` and `WINREACH_PRINCIPALS` may be set together, and at least one
principal must exist or startup fails. Tokens are compared in **constant time** across all principals so
response timing does not leak which token prefix is correct or how long a token is, and duplicate tokens across
principals are rejected at startup. The resolved principal's `name` and `role` are attached to the request and
recorded in the audit log. Requests with a missing or unknown token get HTTP `401`.

### Command allow/deny policy

Command policy is enforced before any command runs, in `enforcePolicy` in
[`src/mcpServer.ts`](../src/mcpServer.ts) using [`src/policy.ts`](../src/policy.ts). A policy is a pair of
case-insensitive regex lists (`allow`, `deny`). Two policies apply to each command:

1. The **global** policy from `WINREACH_COMMAND_ALLOWLIST` / `WINREACH_COMMAND_DENYLIST`.
2. The **caller's principal** policy from its `allow` / `deny` lists.

Evaluation rules:

- **Deny always wins.** If any `deny` pattern matches, the command is blocked.
- A non-empty `allow` list is a strict allowlist: anything not matched is blocked. An empty `allow` list means
  "allow everything not denied".
- The command must pass **both** the global policy and the principal policy; either can reject it.

A blocked command never reaches PowerShell. The tool returns an MCP error whose text explains the reason and
the matched rule (`source:pattern`), and the denial is written to the audit log with `decision: "blocked"`.

Patterns can be supplied as a comma-separated list or, when a pattern itself contains commas (e.g. `\d{1,3}`),
as a JSON array. An invalid regex is a configuration error and fails loudly at startup.

### In-app TLS and mutual TLS

WinReach can terminate HTTPS itself, with no reverse proxy, via [`src/tls.ts`](../src/tls.ts):

- Set `WINREACH_TLS_CERT` and `WINREACH_TLS_KEY` (PEM paths) to serve HTTPS in-app. Use
  `WINREACH_TLS_KEY_PASSPHRASE` for an encrypted key.
- Set `WINREACH_TLS_CLIENT_CA` (a PEM CA bundle) to additionally require **mutual TLS**. Clients without a
  certificate signed by that CA are dropped during the TLS handshake, before the bearer-token check ever runs.
  mTLS requires TLS: setting the client CA without cert/key is a configuration error.

At startup the server logs whether it is serving `http` or `https`, and whether mTLS is enabled. Note that TLS
is applied to the local listener; in Cloudflare tunnel mode, TLS is terminated at Cloudflare and traffic
reaches WinReach over loopback, so in-app TLS/mTLS does not apply to tunnel traffic (the server warns about
this when both are configured).

### Audit logging

Set `WINREACH_AUDIT_LOG` to a file path to record every tool call as append-only
[JSONL](https://jsonlines.org/) (one JSON object per line), implemented in [`src/audit.ts`](../src/audit.ts).
Enable it before starting the server:

```powershell
$env:WINREACH_AUDIT_LOG = "C:\logs\winreach-audit.jsonl"
npm run dev
```

Each entry can include:

| Field | Meaning |
| --- | --- |
| `time` | ISO-8601 timestamp. |
| `principal` | The authenticated principal's name. |
| `role` | The principal's role. |
| `tool` | The MCP tool invoked. |
| `decision` | `allowed`, `blocked`, or `error`. |
| `command` | The PowerShell command (when applicable). |
| `cwd` | Working directory (when supplied). |
| `sessionId` | Session id (for session tools). |
| `reason` | Why a command was blocked (policy denials). |
| `exitCode` | Process exit code for completed commands. |
| `durationMs` | Command duration for completed commands. |

Writes are serialized through an internal promise chain so concurrent tool calls cannot interleave partial
lines, the target directory is created automatically, and a write failure is reported once to stderr rather
than crashing the request. When `WINREACH_AUDIT_LOG` is unset, a no-op logger is used.

A completed command and a policy-blocked command look like this (one object per line, shown formatted here):

```json
{ "time": "2026-07-16T12:00:00.000Z", "principal": "agent", "role": "readonly",
  "tool": "powershell_execute", "decision": "allowed",
  "command": "Get-Process", "exitCode": 0, "durationMs": 143 }
```

```json
{ "time": "2026-07-16T12:01:00.000Z", "principal": "agent", "role": "readonly",
  "tool": "powershell_execute", "decision": "blocked",
  "command": "Remove-Item C:\\data -Recurse",
  "reason": "Command blocked by agent denylist" }
```

Because it is plain JSONL, the log is easy to tail, grep, or ship to a SIEM. To review activity ad hoc, read
the file and filter on `decision`. For example, to list every blocked call:

```powershell
Get-Content C:\logs\winreach-audit.jsonl |
  ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.decision -eq "blocked" } |
  Select-Object time, principal, tool, command, reason
```

Note that `blocked` entries record the `reason`; the finer-grained `matchedRule` (`source:pattern`) is returned
to the caller in the tool error but is not written to the audit log.

### Origin guard and DNS-rebinding protection

Two layers protect against browser-based cross-origin and DNS-rebinding attacks:

- **Origin allowlist** — set `WINREACH_ALLOWED_ORIGINS` to a comma-separated list of permitted `Origin`
  header values. A request whose `Origin` is present but not on the list gets HTTP `403`
  (see `createOriginGuard` in [`src/auth.ts`](../src/auth.ts)).
- **Host-header / DNS-rebinding protection** — the MCP SDK's Express app applies localhost DNS-rebinding
  protection by default, accepting only `localhost` / `127.0.0.1` / `[::1]` `Host` headers. This is why tunnel
  mode rewrites the forwarded `Host` header to `127.0.0.1` (see below) so tunnelled requests still pass.

## Public access with a Cloudflare tunnel

WinReach can publish itself to the public internet in one command through a
[Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/),
implemented in [`src/tunnel.ts`](../src/tunnel.ts). Enable it with `WINREACH_TUNNEL=cloudflare`, or ad hoc
with the `--tunnel` flag:

```powershell
$env:WINREACH_TOKEN = "replace-with-a-long-random-token"
$env:WINREACH_TUNNEL = "cloudflare"
npm run dev
```

What it does:

- **Auto-installs `cloudflared`.** On first use WinReach looks for `cloudflared` at
  `WINREACH_CLOUDFLARED_PATH`, then on `PATH`, then in its cache (`~/.winreach/bin`), and finally downloads
  the official binary from GitHub releases over HTTPS. No Cloudflare account is needed. Set
  `WINREACH_TUNNEL_AUTOINSTALL=0` to require a preinstalled binary instead of auto-downloading.
- **Binds to loopback only.** `cloudflared` connects to WinReach over `127.0.0.1`, so tunnel mode needs no
  `0.0.0.0` bind and no inbound firewall rule.
- **Rewrites the Host header.** WinReach starts `cloudflared` with `--http-host-header 127.0.0.1` so the
  forwarded requests satisfy the SDK's localhost DNS-rebinding protection instead of being rejected with 403.
- **Prints a ready-to-paste config.** On success it logs the public origin, the full public `/mcp` endpoint,
  and Claude Code / Codex connection snippets.

Caveats: quick-tunnel hostnames are random and change on every restart; the endpoint is protected **only** by
the bearer token (use a long random one — WinReach warns at startup when a token looks weak in tunnel mode);
and in-app TLS/mTLS does not apply to tunnel traffic since Cloudflare terminates TLS. For a stable hostname,
move to a named Cloudflare tunnel.

## Configuration

WinReach reads `WINREACH_*` environment variables (loaded in [`src/config.ts`](../src/config.ts)). The
full table is in the [README](../README.md#configuration); the security- and behavior-relevant variables are:

| Variable | Default | Description |
| --- | --- | --- |
| `WINREACH_TOKEN` | required* | Bearer token for a single full-access admin. *Required unless `WINREACH_PRINCIPALS` is set. |
| `WINREACH_PRINCIPALS` | empty | JSON array of per-principal identities with roles, tokens, and optional command policy. |
| `WINREACH_COMMAND_ALLOWLIST` | empty | Global regex allowlist (comma-separated or JSON array). |
| `WINREACH_COMMAND_DENYLIST` | empty | Global regex denylist. Deny wins over allow. |
| `WINREACH_AUDIT_LOG` | empty | Path to the append-only JSONL audit log. |
| `WINREACH_TLS_CERT` / `WINREACH_TLS_KEY` | empty | PEM cert/key paths to serve HTTPS in-app. |
| `WINREACH_TLS_KEY_PASSPHRASE` | empty | Passphrase for an encrypted TLS key. |
| `WINREACH_TLS_CLIENT_CA` | empty | PEM CA bundle to verify client certs (enables mTLS; requires TLS). |
| `WINREACH_ALLOWED_ORIGINS` | empty | Comma-separated allowed `Origin` values. |
| `WINREACH_HOST` | `127.0.0.1` | Bind host. Use `0.0.0.0` only behind a firewall or tunnel. |
| `WINREACH_PORT` | `7573` | Bind port. |
| `WINREACH_ENDPOINT_PATH` | `/mcp` | MCP endpoint path. |
| `WINREACH_SHELL_PATH` | auto | Explicit `pwsh` or `powershell.exe` path. |
| `WINREACH_CWD` | process cwd | Default working directory for commands. |
| `WINREACH_TIMEOUT_MS` | `30000` | Default command timeout. |
| `WINREACH_MAX_OUTPUT_BYTES` | `1048576` | Max captured bytes per output stream. |
| `WINREACH_TUNNEL` | empty | Set to `cloudflare` to publish through a Cloudflare quick tunnel. |
| `WINREACH_TUNNEL_AUTOINSTALL` | `1` | Auto-download `cloudflared` when missing. `0` requires a preinstalled binary. |
| `WINREACH_CLOUDFLARED_PATH` | auto | Explicit path to the `cloudflared` binary. |

## Windows service installation

WinReach ships PowerShell scripts to run as an auto-start Windows service via
[NSSM](https://nssm.cc/) (the Non-Sucking Service Manager), in
[`scripts/install-service.ps1`](../scripts/install-service.ps1) and
[`scripts/uninstall-service.ps1`](../scripts/uninstall-service.ps1). npm aliases exist as
`npm run service:install` and `npm run service:uninstall`.

```powershell
npm run build
$pw = Read-Host -AsSecureString "Service account password"
./scripts/install-service.ps1 -EnvFile .env -ServiceAccount ".\winreach" -ServiceAccountPassword $pw
# Remove later with: ./scripts/uninstall-service.ps1
```

The installer:

- Must run from an elevated (Administrator) PowerShell, and requires the built entrypoint `dist/src/server.js`
  (`npm run build` first).
- Locates `nssm.exe` on `PATH`, at an explicit `-NssmPath`, or downloads it into `~/.winreach/bin`.
- Registers `node dist/src/server.js` as an auto-start service, sets the working directory, and writes rotating
  stdout/stderr logs into the project directory.
- Loads configuration from a `KEY=VALUE` `-EnvFile` (e.g. `.env`) into the service environment, so tokens, TLS
  paths, and the audit-log path are supplied without hard-coding secrets into the service definition. It warns
  if no `WINREACH_TOKEN`/`WINREACH_PRINCIPALS` is present.
- With `-ServiceAccount` + `-ServiceAccountPassword`, runs the service under a dedicated low-privilege Windows
  account instead of `LocalSystem` (the recommended hardening for production); it warns when left as
  `LocalSystem`.
- Re-running is idempotent: any prior installation of the same service name is stopped and removed first.

## Diagnostic client and multi-target support

A built-in diagnostic client ([`src/client.ts`](../src/client.ts)) is a real MCP client for smoke-testing a
deployment before wiring up an agent. Run it with `npm run client -- <command>`:

```powershell
$env:WINREACH_TOKEN = "dev-token"
npm run client -- list-tools
npm run client -- exec Write-Output hello
npm run client -- call-tool powershell_execute '{"command":"Write-Output hello"}'
```

Commands:

- `list-tools` — list the tools the server advertises.
- `exec <command...>` — a shorthand that calls `powershell_execute` with the remaining arguments joined into
  one command string.
- `call-tool <toolName> <json>` — call any tool with a raw JSON arguments object.

**Multi-target support** ([`src/clientTargets.ts`](../src/clientTargets.ts)) lets one invocation hit several
WinReach servers and label each result by target name and URL:

- `WINREACH_URL` — a single server URL (default `http://127.0.0.1:7573/mcp`).
- `WINREACH_URLS` — a comma-separated list of URLs that all share `WINREACH_TOKEN`.
- `--url <url>` (repeatable) — pass URLs on the command line; they also share `WINREACH_TOKEN`.
- `WINREACH_TARGETS` — a JSON array of named targets, each with its own `url` and an inline `token` or a
  `tokenEnv` naming a per-target environment variable, for servers that use different tokens.

When more than one target is addressed, each result is printed with its target `name` and `url` so you can
tell which Windows server answered, and the client exits non-zero if any target failed.
