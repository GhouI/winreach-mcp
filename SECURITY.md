# Security Policy

WinBridge executes arbitrary PowerShell after authentication. A compromised token is equivalent to command execution as the user running the server. The features below reduce, but do not eliminate, that risk — treat WinBridge as sensitive infrastructure.

## Recommended Deployment

- Bind to `127.0.0.1` by default.
- Terminate TLS in the app (`WINBRIDGE_TLS_CERT`/`WINBRIDGE_TLS_KEY`) or put remote access behind a trusted tunnel, VPN, or reverse proxy with TLS.
- Require client certificates (mTLS) for internet-facing instances (`WINBRIDGE_TLS_CLIENT_CA`).
- Use a dedicated Windows account with the minimum permissions needed. The service installer (`scripts/install-service.ps1 -ServiceAccount`) configures this for you.
- Rotate tokens regularly.
- Give each client its own principal (`WINBRIDGE_PRINCIPALS`) so tokens can be rotated and revoked independently.
- Constrain what can run with command allow/deny lists (`WINBRIDGE_COMMAND_ALLOWLIST`/`WINBRIDGE_COMMAND_DENYLIST`, or per-principal `allow`/`deny`).
- Enable the audit log (`WINBRIDGE_AUDIT_LOG`) and retain it when deploying outside local development.

## Implemented Controls

| Control | How to enable | Notes |
| --- | --- | --- |
| In-app TLS termination | `WINBRIDGE_TLS_CERT` + `WINBRIDGE_TLS_KEY` (+ `WINBRIDGE_TLS_KEY_PASSPHRASE`) | WinBridge serves HTTPS directly; no reverse proxy required. |
| Mutual TLS (mTLS) | `WINBRIDGE_TLS_CLIENT_CA` (requires TLS) | Clients without a certificate signed by the CA are rejected during the TLS handshake, before the token check. |
| Per-user authorization | `WINBRIDGE_PRINCIPALS` (JSON array) | Each principal has its own token, role, an optional command policy, and an optional `tools` allowlist that limits it to specific MCP tools (a tool not in the list is never offered to that principal). The legacy `WINBRIDGE_TOKEN` remains a single full-access admin. |
| Command allow/deny lists | `WINBRIDGE_COMMAND_ALLOWLIST` / `WINBRIDGE_COMMAND_DENYLIST`, plus per-principal `allow`/`deny` | Case-insensitive regex. Deny always wins; a non-empty allowlist blocks anything it does not match. Blocked calls return an MCP error and are audited. |
| Command audit logging | `WINBRIDGE_AUDIT_LOG` | Append-only JSONL: principal, role, tool, decision (allowed/blocked), command, cwd, session, exit code, duration. |
| Screen-capture gating | `WINBRIDGE_ALLOW_SCREENSHOT` (+ `WINBRIDGE_SCREENSHOT_ROLES`) | `take_screenshot` reads the whole desktop, a capability the command policy cannot express. It is disabled by default and only registered for permitted roles; each capture is audited. Captures go to a server-owned dir (`WINBRIDGE_SCREENSHOT_DIR`), never a caller-supplied path, and are pruned after `WINBRIDGE_SCREENSHOT_RETENTION_HOURS` (default 8). |
| File-transfer sandbox | `WINBRIDGE_FILE_ROOT` (+ `WINBRIDGE_MAX_FILE_BYTES`) | `file_upload`/`file_download` bypass the command policy, so they are disabled until a root directory is configured. Every path is confined to that root — absolute paths, `..` traversal, and escaping symlinks are rejected — and transfers over `WINBRIDGE_MAX_FILE_BYTES` (default 75 MB) are refused. Each transfer is audited. The request body is only parsed **after** the bearer token is validated, so an unauthenticated client cannot make the server buffer a large upload. |
| Windows credential login (dedicated service account) | `scripts/install-service.ps1 -ServiceAccount ".\winbridge" -ServiceAccountPassword $pw` | Runs the service under a specific Windows account instead of LocalSystem. |
| Windows service installer | `npm run service:install` / `scripts/install-service.ps1` | Registers WinBridge as an auto-start Windows service via NSSM. `scripts/uninstall-service.ps1` removes it. |

> **File-transfer memory note.** An in-flight upload holds roughly 3× the file in memory (raw body + decoded base64 string + decoded buffer), so `WINBRIDGE_MAX_FILE_BYTES` × concurrent uploads bounds peak RAM. Body parsing only happens for authenticated requests, but a trusted principal can still drive concurrent large uploads. On a shared or memory-constrained host, keep `WINBRIDGE_MAX_FILE_BYTES` modest and/or front WinBridge with a reverse proxy that caps concurrent connections.

Policy evaluation order: a command must pass the **global** policy and then the **caller's principal** policy. Either can reject it.

## Not Yet Implemented

- Request-level Windows Integrated Authentication (Negotiate/NTLM/Kerberos over HTTP). This needs native SSPI bindings; request auth is handled by bearer tokens and, optionally, mTLS client certificates. The `-ServiceAccount` installer option covers running *as* a Windows credential.
- Rate limiting / per-principal quotas.
- Automatic token rotation (rotate manually and update clients).
