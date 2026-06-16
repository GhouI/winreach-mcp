# WinBridge MCP

[![CI](https://github.com/GhouI/pendragon-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/GhouI/pendragon-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)](https://modelcontextprotocol.io)
[![Windows](https://img.shields.io/badge/Windows-PowerShell-5391FE)](https://learn.microsoft.com/powershell/)

**AI agents can write code, run terminals, and use tools. Windows RDP still traps them behind a GUI. WinBridge turns a Windows host into an MCP-native PowerShell target — and can publish it to your agent with a single command.**

WinBridge is a TypeScript [Model Context Protocol](https://modelcontextprotocol.io) server that runs on a Windows machine and exposes PowerShell tools over Streamable HTTP. It lets Codex, Claude Code, and other MCP-capable agents operate a Windows host without RDP screenshots, mouse control, or a human-owned terminal window.

```text
Agent or MCP client  ->  WinBridge MCP over HTTP  ->  Windows PowerShell
```

> Renamed from **Pendragon MCP**. Legacy `PENDRAGON_*` environment variables still work as aliases — see [Configuration](#configuration).

## Demo

[![WinBridge demo poster](assets/winbridge-demo.png)](assets/winbridge-demo.mp4)

Watch the generated demo video: [assets/winbridge-demo.mp4](assets/winbridge-demo.mp4)

The demo is rendered with [Remotion](https://www.remotion.dev/) from the source in [video/](video/). Re-render it locally with:

```powershell
npm run video:render
```

## Why WinBridge?

Most coding agents are comfortable in terminals, but Windows RDP is a GUI-first environment. WinBridge gives agents a clean command surface instead:

- Run PowerShell commands on a Windows host from any MCP client.
- Keep persistent PowerShell sessions when variables, cwd, or imported modules matter.
- Publish the server to your agent in one command with a built-in Cloudflare tunnel — no fixed public IP, no inbound firewall hole.
- Use bearer-token auth and provider firewalls instead of exposing raw RDP workflows.
- Test locally with a diagnostic client before connecting a real agent.
- Avoid IIS: WinBridge is a standalone Node HTTP server.

## Tooling

WinBridge exposes five MCP tools:

| Tool | Purpose |
| --- | --- |
| `powershell_execute` | Run one isolated PowerShell command. |
| `powershell_open_session` | Start a persistent PowerShell session. |
| `powershell_send` | Send a command to a persistent session. |
| `powershell_close_session` | Close a persistent session. |
| `powershell_list_sessions` | List active sessions. |

Command results include:

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

## Quickstart

Requirements:

- Node.js 24 or newer
- npm
- Windows PowerShell (`powershell.exe`) or PowerShell 7 (`pwsh`)

Run WinBridge locally:

```powershell
git clone https://github.com/GhouI/pendragon-mcp.git
cd pendragon-mcp
npm install
$env:WINBRIDGE_TOKEN = "dev-token"
npm run dev
```

The server defaults to:

```text
http://127.0.0.1:7573/mcp
```

Use the diagnostic client from another terminal:

```powershell
$env:WINBRIDGE_TOKEN = "dev-token"
npm run client -- list-tools
npm run client -- exec Write-Output hello
```

Target more than one WinBridge server with `WINBRIDGE_URLS`:

```powershell
$env:WINBRIDGE_TOKEN = "shared-token"
$env:WINBRIDGE_URLS = "http://win-1:7573/mcp,http://win-2:7573/mcp"
npm run client -- exec hostname
```

## Public Access With One Command

When you set up WinBridge on a server and want an agent to reach it from anywhere, enable the built-in [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/). WinBridge downloads `cloudflared` on first use (no Cloudflare account needed), opens a tunnel, and prints a ready-to-paste agent config.

```powershell
$env:WINBRIDGE_TOKEN = "replace-with-a-long-random-token"
$env:WINBRIDGE_TUNNEL = "cloudflare"
npm run dev
```

Output:

```text
WinBridge MCP listening at http://127.0.0.1:7573/mcp
Cloudflare tunnel ready: https://random-words.trycloudflare.com
Public MCP endpoint: https://random-words.trycloudflare.com/mcp

Connect an agent with this public endpoint (the bearer token is still required):

Claude Code:
  claude mcp add --transport http winbridge https://random-words.trycloudflare.com/mcp --header "Authorization: Bearer <WINBRIDGE_TOKEN>"
...
```

You can also enable it ad hoc with a flag:

```powershell
npm run dev -- --tunnel
```

Notes:

- `cloudflared` connects to WinBridge over loopback, so tunnel mode needs **no** `0.0.0.0` bind and **no** inbound firewall rule.
- Quick-tunnel hostnames are random and **change every restart**. Re-paste the printed URL into your agent, or move to a [named Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for a stable hostname.
- The bearer token is still enforced over the tunnel. Treat the public URL as sensitive and rotate the token after demos.
- Set `WINBRIDGE_TUNNEL_AUTOINSTALL=0` to require a preinstalled `cloudflared`, or `WINBRIDGE_CLOUDFLARED_PATH` to point at a specific binary.

## Connect Agents

Full setup guide: [Install WinBridge and Connect Agents](docs/INSTALL_AND_AGENT_USAGE.md)

Codex `~/.codex/config.toml`:

```toml
[mcp_servers.winbridge]
url = "http://WINDOWS_SERVER_IP:7573/mcp"
bearer_token_env_var = "WINBRIDGE_TOKEN"
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
enabled = true
```

Claude Code:

```powershell
claude mcp add --transport http winbridge http://WINDOWS_SERVER_IP:7573/mcp `
  --header "Authorization: Bearer YOUR_TOKEN"
```

Also see:

- [Codex config example](examples/codex-config.toml)
- [Claude Code MCP JSON example](examples/claude.mcp.json)

## Remote Windows Deployment

On the Windows host:

```powershell
git clone https://github.com/GhouI/pendragon-mcp.git
cd pendragon-mcp
npm install
$env:WINBRIDGE_TOKEN = "replace-with-a-long-random-token"
$env:WINBRIDGE_HOST = "0.0.0.0"
$env:WINBRIDGE_PORT = "7573"
npm run dev
```

Open the Windows firewall for the MCP port:

```powershell
New-NetFirewallRule `
  -DisplayName "WinBridge MCP 7573" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 7573 `
  -Action Allow
```

Restrict your cloud firewall so TCP `7573` is reachable only from trusted IP addresses. If you only need agent access (not raw port access), prefer [tunnel mode](#public-access-with-one-command) and keep the bind on `127.0.0.1`.

## Configuration

WinBridge reads `WINBRIDGE_*` variables. The legacy `PENDRAGON_*` names are still accepted as aliases; `WINBRIDGE_*` wins when both are set.

| Variable | Default | Description |
| --- | --- | --- |
| `WINBRIDGE_TOKEN` | required | Bearer token required for all MCP requests. |
| `WINBRIDGE_URL` | `http://127.0.0.1:7573/mcp` | Diagnostic client URL for one WinBridge server. |
| `WINBRIDGE_URLS` | empty | Diagnostic client comma-separated URLs for multiple servers using `WINBRIDGE_TOKEN`. |
| `WINBRIDGE_TARGETS` | empty | Diagnostic client JSON array for named servers and per-target token env vars. |
| `WINBRIDGE_HOST` | `127.0.0.1` | Bind host. Use `0.0.0.0` only behind a firewall or tunnel. |
| `WINBRIDGE_PORT` | `7573` | Bind port. |
| `WINBRIDGE_ENDPOINT_PATH` | `/mcp` | MCP endpoint path. |
| `WINBRIDGE_ALLOWED_ORIGINS` | empty | Comma-separated allowed `Origin` values. |
| `WINBRIDGE_SHELL_PATH` | auto | Explicit `pwsh` or `powershell.exe` path. |
| `WINBRIDGE_CWD` | process cwd | Default working directory. |
| `WINBRIDGE_TIMEOUT_MS` | `30000` | Default command timeout. |
| `WINBRIDGE_MAX_OUTPUT_BYTES` | `1048576` | Max captured bytes per output stream. |
| `WINBRIDGE_TUNNEL` | empty | Set to `cloudflare` to publish the server through a Cloudflare quick tunnel. |
| `WINBRIDGE_TUNNEL_AUTOINSTALL` | `1` | Auto-download `cloudflared` when missing. Set to `0` to require a preinstalled binary. |
| `WINBRIDGE_CLOUDFLARED_PATH` | auto | Explicit path to the `cloudflared` binary. |

## Security

WinBridge is a remote command-execution server. Treat it as sensitive infrastructure.

- Use a long random `WINBRIDGE_TOKEN`.
- Keep `WINBRIDGE_HOST=127.0.0.1` unless you have a trusted network path or are using tunnel mode.
- Do not expose WinBridge directly to the public internet on a raw port.
- Restrict TCP `7573` at your provider firewall.
- Tunnel URLs are still protected by the bearer token, but treat them as secrets and rotate after demos.
- Run as a dedicated low-privilege Windows user when possible.
- Rotate tokens after demos, testing sessions, and shared access.

See [SECURITY.md](SECURITY.md) for more detail.

## Roadmap

- Named Cloudflare tunnels for stable hostnames
- HTTPS or reverse-proxy deployment examples
- Windows service installation
- richer audit logs
- optional command policy controls
- Git Bash support
- per-client authorization
- packaged releases

## Contributing

Issues, ideas, and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
