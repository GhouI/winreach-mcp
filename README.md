# Pendragon MCP

Pendragon is a TypeScript MCP bridge for headless PowerShell execution on Windows hosts.
It runs as a standalone Streamable HTTP MCP server, so no IIS or RDP GUI automation is required.

## What It Does

Pendragon exposes these MCP tools:

- `powershell_execute` - run a one-shot PowerShell command.
- `powershell_open_session` - open a persistent PowerShell session.
- `powershell_send` - send a command to an existing session.
- `powershell_close_session` - close a session.
- `powershell_list_sessions` - list active sessions.

Tool results include `stdout`, `stderr`, `exitCode`, `durationMs`, `truncated`, and `commandId` where applicable.

## Requirements

- Node.js 24 or newer
- npm
- Windows PowerShell (`powershell.exe`) or PowerShell 7 (`pwsh`)

## Local Run

```powershell
npm install
$env:PENDRAGON_TOKEN = "dev-token"
npm run dev
```

The server defaults to:

```text
http://127.0.0.1:3000/mcp
```

Use the diagnostic client from another terminal:

```powershell
$env:PENDRAGON_TOKEN = "dev-token"
npm run client -- list-tools
npm run client -- call-tool powershell_execute '{ "command": "Write-Output hello" }'
```

## Configuration

Environment variables:

- `PENDRAGON_TOKEN` - required bearer token.
- `PENDRAGON_HOST` - bind host, default `127.0.0.1`.
- `PENDRAGON_PORT` - bind port, default `3000`.
- `PENDRAGON_ENDPOINT_PATH` - MCP endpoint, default `/mcp`.
- `PENDRAGON_ALLOWED_ORIGINS` - comma-separated allowed `Origin` values.
- `PENDRAGON_SHELL_PATH` - explicit shell path.
- `PENDRAGON_CWD` - default working directory.
- `PENDRAGON_TIMEOUT_MS` - default command timeout.
- `PENDRAGON_MAX_OUTPUT_BYTES` - max captured bytes per output stream.

## Testing

```powershell
npm run typecheck
npm test
```

The test suite uses local PowerShell when available and includes a mock shell fixture for deterministic command behavior.

## Security

Pendragon is a remote command-execution server. Treat it as sensitive infrastructure.

- Keep `PENDRAGON_HOST=127.0.0.1` unless you have a private network or tunnel.
- Use a strong `PENDRAGON_TOKEN`.
- Do not expose this server directly to the public internet.
- Commands run as the OS user that launched the server.
- v1 intentionally allows arbitrary PowerShell after authentication.

Future hardening should add TLS/mTLS, richer audit logs, per-client authorization, and command policy controls.
