# Security Policy

WinReach executes arbitrary PowerShell after authentication. A compromised token is equivalent to command execution as the user running the server. The features below reduce, but do not eliminate, that risk — treat WinReach as sensitive infrastructure.

## Recommended Deployment

- Bind to `127.0.0.1` by default.
- Terminate TLS in the app (`WINREACH_TLS_CERT`/`WINREACH_TLS_KEY`) or put remote access behind a trusted tunnel, VPN, or reverse proxy with TLS.
- Require client certificates (mTLS) for internet-facing instances (`WINREACH_TLS_CLIENT_CA`).
- Use a dedicated Windows account with the minimum permissions needed. The service installer (`scripts/install-service.ps1 -ServiceAccount`) configures this for you.
- Rotate tokens regularly.
- Give each client its own principal (`WINREACH_PRINCIPALS`) so tokens can be rotated and revoked independently.
- Constrain what can run with command allow/deny lists (`WINREACH_COMMAND_ALLOWLIST`/`WINREACH_COMMAND_DENYLIST`, or per-principal `allow`/`deny`).
- Enable the audit log (`WINREACH_AUDIT_LOG`) and retain it when deploying outside local development.

## Implemented Controls

| Control | How to enable | Notes |
| --- | --- | --- |
| In-app TLS termination | `WINREACH_TLS_CERT` + `WINREACH_TLS_KEY` (+ `WINREACH_TLS_KEY_PASSPHRASE`) | WinReach serves HTTPS directly; no reverse proxy required. |
| Mutual TLS (mTLS) | `WINREACH_TLS_CLIENT_CA` (requires TLS) | Clients without a certificate signed by the CA are rejected during the TLS handshake, before the token check. |
| Per-user authorization | `WINREACH_PRINCIPALS` (JSON array) | Each principal has its own token, role, an optional command policy, and an optional `tools` allowlist that limits it to specific MCP tools (a tool not in the list is never offered). A key may be a plaintext `token`/`tokenEnv` or a SHA-256 `tokenHash` (WinReach hashes the presented token and compares, so an external key store never holds the plaintext). The legacy `WINREACH_TOKEN` remains a single full-access admin. |
| Reusable roles | `WINREACH_ROLES` (JSON object) | A role is a named permission template — `{ "deployer": { "tools": [...], "allow": [...], "deny": [...] } }`. A principal whose `role` names a defined role inherits that role's tool allowlist and command policy, so a permission set is defined once and reused across users; edit the role and every principal using it changes. A field set on the principal itself (`tools`/`allow`/`deny`) overrides the role's value for that field; an undefined `role` is just a label (no inheritance). Roles compose with role-gated features like `WINREACH_SCREENSHOT_ROLES`. |
| Command allow/deny lists | `WINREACH_COMMAND_ALLOWLIST` / `WINREACH_COMMAND_DENYLIST`, plus per-principal `allow`/`deny` | Case-insensitive regex. Deny always wins; a non-empty allowlist blocks anything it does not match. Blocked calls return an MCP error and are audited. |
| Command audit logging | `WINREACH_AUDIT_LOG` | Append-only JSONL: principal, role, tool, decision (allowed/blocked), command, cwd, session, exit code, duration. |
| Desktop input (computer use) | `WINREACH_ALLOW_COMPUTER_USE` (+ `WINREACH_COMPUTER_USE_ROLES`) | The `computer_use` tool drives the mouse and keyboard (move/click, type, key chords, scroll) via Win32 `SendInput`. **GUI actuation bypasses the command allow/deny policy** — a principal that can drive the desktop can type any command into a window — so it is the most dangerous capability: disabled by default, and should be granted to trusted roles (admin/operator) only. Off unless enabled; when enabled, only registered for permitted roles and if the principal's `tools` allowlist permits it. Every action is audited; typed text is redacted to a length + truncated SHA-256 unless `WINREACH_COMPUTER_USE_AUDIT_TEXT` is set. A per-principal rate limit (`WINREACH_COMPUTER_USE_MAX_ACTIONS_PER_SEC`, default 10), an optional key-chord denylist (`WINREACH_COMPUTER_USE_KEY_DENYLIST`, a speed bump not a boundary), and a kill-switch file (`WINREACH_COMPUTER_USE_HALT_FILE`, halts all actuation while present) bound the blast radius. Coordinates are absolute virtual-desktop pixels (same space as `take_screenshot`); out-of-bounds coordinates are rejected. Requires an active interactive desktop (fails in session 0); `Ctrl+Alt+Del` and the secure desktop (UAC/lock screen) cannot be driven. |
| Screen-capture gating | `WINREACH_ALLOW_SCREENSHOT` (+ `WINREACH_SCREENSHOT_ROLES`) | `take_screenshot` reads the whole desktop, a capability the command policy cannot express. It is disabled by default and only registered for permitted roles; each capture is audited. Captures go to a server-owned dir (`WINREACH_SCREENSHOT_DIR`), never a caller-supplied path, and are pruned after `WINREACH_SCREENSHOT_RETENTION_HOURS` (default 8). |
| File-transfer sandbox | `WINREACH_FILE_ROOT` (+ `WINREACH_MAX_FILE_BYTES`) | `file_upload`/`file_download` bypass the command policy, so they are disabled until a root directory is configured. Every path is confined to that root — absolute paths, `..` traversal, and escaping symlinks are rejected — and transfers over `WINREACH_MAX_FILE_BYTES` (default 75 MB) are refused. Each transfer is audited. The request body is only parsed **after** the bearer token is validated, so an unauthenticated client cannot make the server buffer a large upload. |
| Windows credential login (dedicated service account) | `scripts/install-service.ps1 -ServiceAccount ".\winreach" -ServiceAccountPassword $pw` | Runs the service under a specific Windows account instead of LocalSystem. |
| Windows service installer | `npm run service:install` / `scripts/install-service.ps1` | Registers WinReach as an auto-start Windows service via NSSM. `scripts/uninstall-service.ps1` removes it. |

> **File-transfer memory note.** An in-flight upload holds roughly 3× the file in memory (raw body + decoded base64 string + decoded buffer), so `WINREACH_MAX_FILE_BYTES` × concurrent uploads bounds peak RAM. Body parsing only happens for authenticated requests, but a trusted principal can still drive concurrent large uploads. On a shared or memory-constrained host, keep `WINREACH_MAX_FILE_BYTES` modest and/or front WinReach with a reverse proxy that caps concurrent connections.

Policy evaluation order: a command must pass the **global** policy and then the **caller's principal** policy. Either can reject it.

## Not Yet Implemented

- Request-level Windows Integrated Authentication (Negotiate/NTLM/Kerberos over HTTP). This needs native SSPI bindings; request auth is handled by bearer tokens and, optionally, mTLS client certificates. The `-ServiceAccount` installer option covers running *as* a Windows credential.
- Rate limiting / per-principal quotas.
- Automatic token rotation (rotate manually and update clients).
