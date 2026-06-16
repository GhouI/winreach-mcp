# Install WinBridge and Connect Agents

WinBridge is a remote MCP server for headless PowerShell on Windows hosts. Agents connect over Streamable HTTP and call tools instead of using screenshots, RDP mouse control, or a terminal embedded in the RDP session.

## 1. Install On Windows

Install Node.js 24 or newer, then run:

```powershell
git clone https://github.com/GhouI/pendragon-mcp.git
cd pendragon-mcp
npm install
npm run typecheck
npm test
```

Start the MCP server:

```powershell
$env:WINBRIDGE_TOKEN = "replace-with-a-long-random-token"
$env:WINBRIDGE_HOST = "0.0.0.0"
$env:WINBRIDGE_PORT = "7573"
npm run dev
```

Open Windows Firewall for the MCP port:

```powershell
New-NetFirewallRule `
  -DisplayName "WinBridge MCP 7573" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 7573 `
  -Action Allow
```

On your cloud provider firewall, allow TCP `7573` only from the IP addresses that need agent access. Keep RDP `3389` restricted to your own IP.

## 1a. Publish With One Command (Cloudflare Tunnel)

If you do not want to open a port or manage a public IP, let WinBridge publish itself through a Cloudflare quick tunnel. WinBridge downloads `cloudflared` on first use (no Cloudflare account required), opens the tunnel, and prints a ready-to-paste agent config.

```powershell
$env:WINBRIDGE_TOKEN = "replace-with-a-long-random-token"
$env:WINBRIDGE_TUNNEL = "cloudflare"
npm run dev
```

WinBridge prints a public endpoint such as `https://random-words.trycloudflare.com/mcp`. Because `cloudflared` connects over loopback, you can keep `WINBRIDGE_HOST=127.0.0.1` and skip the inbound firewall rule entirely.

Caveats:

- Quick-tunnel hostnames are random and change on every restart. Re-paste the printed URL into your agent after each restart, or set up a [named Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for a stable hostname.
- The bearer token is still enforced over the tunnel. Treat the public URL as a secret and rotate the token after demos.
- To require a preinstalled `cloudflared` instead of auto-download, set `WINBRIDGE_TUNNEL_AUTOINSTALL=0`. To point at a specific binary, set `WINBRIDGE_CLOUDFLARED_PATH`.

## 2. Test From Another Machine

Clone the repo locally or use another MCP client:

```powershell
git clone https://github.com/GhouI/pendragon-mcp.git
cd pendragon-mcp
npm install
$env:WINBRIDGE_URL = "http://WINDOWS_SERVER_IP:7573/mcp"
$env:WINBRIDGE_TOKEN = "same-token-used-on-the-server"
npm run client -- list-tools
npm run client -- exec hostname
npm run client -- exec Get-ComputerInfo
```

Expected `exec hostname` output includes JSON text with `stdout`, `stderr`, `exitCode`, `durationMs`, `truncated`, and `commandId`.

## 3. Test Multiple Servers

If every WinBridge server uses the same token, use `WINBRIDGE_URLS`:

```powershell
$env:WINBRIDGE_TOKEN = "shared-token"
$env:WINBRIDGE_URLS = "http://win-1:7573/mcp,http://win-2:7573/mcp"
npm run client -- exec hostname
```

You can also pass URLs directly:

```powershell
$env:WINBRIDGE_TOKEN = "shared-token"
npm run client -- --url http://win-1:7573/mcp --url http://win-2:7573/mcp exec hostname
```

For named servers or different token environment variables, use `WINBRIDGE_TARGETS`:

```powershell
$env:WINBRIDGE_WIN1_TOKEN = "token-for-win-1"
$env:WINBRIDGE_WIN2_TOKEN = "token-for-win-2"
$env:WINBRIDGE_TARGETS = @'
[
  {
    "name": "build-runner",
    "url": "http://win-1:7573/mcp",
    "tokenEnv": "WINBRIDGE_WIN1_TOKEN"
  },
  {
    "name": "test-runner",
    "url": "http://win-2:7573/mcp",
    "tokenEnv": "WINBRIDGE_WIN2_TOKEN"
  }
]
'@
npm run client -- exec hostname
```

In multi-target mode, the diagnostic client prints each result with the target name and URL so you can tell which Windows server answered.

## 4. How Agents Use WinBridge

Agents see WinBridge as an MCP tool server with these tools:

- `powershell_execute`: run one isolated command.
- `powershell_open_session`: create a persistent PowerShell process.
- `powershell_send`: send a command to a persistent session.
- `powershell_close_session`: close a persistent session.
- `powershell_list_sessions`: list active persistent sessions.

Use `powershell_execute` for most commands:

```json
{
  "command": "Get-Process | Select-Object -First 5",
  "timeoutMs": 30000
}
```

Use a persistent session when state matters:

```json
{
  "cwd": "C:\\Users\\Administrator"
}
```

Then send session commands:

```json
{
  "sessionId": "SESSION_ID_FROM_OPEN",
  "command": "$x = 42; Write-Output $x"
}
```

Close the session when finished:

```json
{
  "sessionId": "SESSION_ID_FROM_OPEN"
}
```

## 5. Connect Codex

Codex supports Streamable HTTP MCP servers with bearer-token authentication through `config.toml`. Put this in `~/.codex/config.toml`, or in `.codex/config.toml` for a trusted project:

```toml
[mcp_servers.winbridge]
url = "http://WINDOWS_SERVER_IP:7573/mcp"
bearer_token_env_var = "WINBRIDGE_TOKEN"
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
enabled = true
```

Set the token before starting Codex:

```powershell
$env:WINBRIDGE_TOKEN = "same-token-used-on-the-server"
codex
```

In Codex, run `/mcp` to confirm the server is connected. Then ask for tasks like:

```text
Use WinBridge to run hostname on the Windows server.
```

For unattended runs, keep `default_tools_approval_mode = "prompt"` until you trust the deployment. This is a remote command-execution server.

Codex reference: the Codex manual documents Streamable HTTP MCP servers with `url` and `bearer_token_env_var` in `config.toml`, and states that Codex reads the MCP server `instructions` field during initialization.

## 6. Connect Claude Code

Claude Code supports remote HTTP MCP servers. Add WinBridge with a bearer token header:

```powershell
claude mcp add --transport http winbridge http://WINDOWS_SERVER_IP:7573/mcp `
  --header "Authorization: Bearer YOUR_TOKEN"
```

Check status:

```powershell
claude mcp list
```

Inside Claude Code, use:

```text
/mcp
```

Then ask:

```text
Use the WinBridge MCP server to run hostname on the Windows server.
```

Claude Code MCP tools use the name pattern:

```text
mcp__winbridge__powershell_execute
```

If using the Claude Agent SDK or a `.mcp.json` file, configure the HTTP server like this:

```json
{
  "mcpServers": {
    "winbridge": {
      "type": "http",
      "url": "http://WINDOWS_SERVER_IP:7573/mcp",
      "headers": {
        "Authorization": "Bearer ${WINBRIDGE_TOKEN}"
      }
    }
  }
}
```

Claude Code reference: Anthropic documents `claude mcp add --transport http <name> <url>`, bearer headers with `--header`, and HTTP config entries with `type`, `url`, and `headers`.

## 7. Security Notes

WinBridge allows arbitrary PowerShell after authentication. Do not expose it to the public internet without additional controls.

- Use a long random token.
- Restrict TCP `7573` to trusted source IPs.
- Prefer HTTPS or a private tunnel for non-local deployments.
- Run WinBridge as a dedicated Windows user with limited privileges when possible.
- Rotate the token after any shared testing session.
- Stop the server when not actively testing.
