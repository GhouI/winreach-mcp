# Install Pendragon and Connect Agents

Pendragon is a remote MCP server for headless PowerShell on Windows hosts. Agents connect over Streamable HTTP and call tools instead of using screenshots, RDP mouse control, or a terminal embedded in the RDP session.

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
$env:PENDRAGON_TOKEN = "replace-with-a-long-random-token"
$env:PENDRAGON_HOST = "0.0.0.0"
$env:PENDRAGON_PORT = "7573"
npm run dev
```

Open Windows Firewall for the MCP port:

```powershell
New-NetFirewallRule `
  -DisplayName "Pendragon MCP 7573" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 7573 `
  -Action Allow
```

On your cloud provider firewall, allow TCP `7573` only from the IP addresses that need agent access. Keep RDP `3389` restricted to your own IP.

## 2. Test From Another Machine

Clone the repo locally or use another MCP client:

```powershell
git clone https://github.com/GhouI/pendragon-mcp.git
cd pendragon-mcp
npm install
$env:PENDRAGON_URL = "http://WINDOWS_SERVER_IP:7573/mcp"
$env:PENDRAGON_TOKEN = "same-token-used-on-the-server"
npm run client -- list-tools
npm run client -- exec hostname
npm run client -- exec Get-ComputerInfo
```

Expected `exec hostname` output includes JSON text with `stdout`, `stderr`, `exitCode`, `durationMs`, `truncated`, and `commandId`.

## 3. How Agents Use Pendragon

Agents see Pendragon as an MCP tool server with these tools:

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

## 4. Connect Codex

Codex supports Streamable HTTP MCP servers with bearer-token authentication through `config.toml`. Put this in `~/.codex/config.toml`, or in `.codex/config.toml` for a trusted project:

```toml
[mcp_servers.pendragon]
url = "http://WINDOWS_SERVER_IP:7573/mcp"
bearer_token_env_var = "PENDRAGON_TOKEN"
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
enabled = true
```

Set the token before starting Codex:

```powershell
$env:PENDRAGON_TOKEN = "same-token-used-on-the-server"
codex
```

In Codex, run `/mcp` to confirm the server is connected. Then ask for tasks like:

```text
Use Pendragon to run hostname on the Windows server.
```

For unattended runs, keep `default_tools_approval_mode = "prompt"` until you trust the deployment. This is a remote command-execution server.

Codex reference: the Codex manual documents Streamable HTTP MCP servers with `url` and `bearer_token_env_var` in `config.toml`, and states that Codex reads the MCP server `instructions` field during initialization.

## 5. Connect Claude Code

Claude Code supports remote HTTP MCP servers. Add Pendragon with a bearer token header:

```powershell
claude mcp add --transport http pendragon http://WINDOWS_SERVER_IP:7573/mcp `
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
Use the Pendragon MCP server to run hostname on the Windows server.
```

Claude Code MCP tools use the name pattern:

```text
mcp__pendragon__powershell_execute
```

If using the Claude Agent SDK or a `.mcp.json` file, configure the HTTP server like this:

```json
{
  "mcpServers": {
    "pendragon": {
      "type": "http",
      "url": "http://WINDOWS_SERVER_IP:7573/mcp",
      "headers": {
        "Authorization": "Bearer ${PENDRAGON_TOKEN}"
      }
    }
  }
}
```

Claude Code reference: Anthropic documents `claude mcp add --transport http <name> <url>`, bearer headers with `--header`, and HTTP config entries with `type`, `url`, and `headers`.

## 6. Security Notes

Pendragon allows arbitrary PowerShell after authentication. Do not expose it to the public internet without additional controls.

- Use a long random token.
- Restrict TCP `7573` to trusted source IPs.
- Prefer HTTPS or a private tunnel for non-local deployments.
- Run Pendragon as a dedicated Windows user with limited privileges when possible.
- Rotate the token after any shared testing session.
- Stop the server when not actively testing.
