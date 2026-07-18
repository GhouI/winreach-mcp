# Connect Your Agent to WinReach

Copy-paste-ready snippets for every major MCP client. WinReach speaks two
transports:

- **Local stdio** — the client launches WinReach on the Windows machine with
  `npx -y winreach-mcp --stdio`. No HTTP, no tunnel, no firewall rule. The local
  launcher is trusted, so it runs as a single implicit admin principal; if you
  don't set `WINREACH_TOKEN`, an ephemeral in-memory token is minted for the
  session. **This is the fastest path — start here.**
- **Remote HTTP** — WinReach runs as a Streamable-HTTP server on the Windows host
  and agents connect over the network with an `Authorization: Bearer` header.
  Use this to reach a Windows box from another machine (optionally through the
  built-in Cloudflare tunnel).

## 0. Get a token

Remote mode needs a bearer token; local stdio mode can mint one for you. Generate
a strong one any time:

```powershell
npx winreach-mcp gen-token
# -> 9V4P3Am6EjKsMJVetyrl-s60NVcP_MmDvsP_gFgcq3U
```

For remote mode, start the server with that token:

```powershell
$env:WINREACH_TOKEN = "PASTE_TOKEN_HERE"
npx winreach-mcp            # add --tunnel for a public Cloudflare URL
```

---

## Claude Code

**Local (stdio):**

```powershell
claude mcp add winreach --transport stdio -- npx -y winreach-mcp --stdio
```

**Remote (HTTP + bearer):**

```powershell
claude mcp add --transport http winreach https://YOUR_WINREACH_HOST/mcp `
  --header "Authorization: Bearer PASTE_TOKEN_HERE"
```

## Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config).

**Local (stdio) — no token needed:**

```jsonc
{
  "mcpServers": {
    "winreach": {
      "command": "npx",
      "args": ["-y", "winreach-mcp", "--stdio"]
      // optional: "env": { "WINREACH_TOKEN": "PASTE_TOKEN_HERE" }
    }
  }
}
```

**Remote (HTTP + bearer):**

```jsonc
{
  "mcpServers": {
    "winreach": {
      "type": "http",
      "url": "https://YOUR_WINREACH_HOST/mcp",
      "headers": {
        "Authorization": "Bearer PASTE_TOKEN_HERE"
      }
    }
  }
}
```

Prefer one click? Install the DXT extension — see [One-click Claude Desktop
extension](#one-click-claude-desktop-extension-dxt--mcpb) below.

## Codex

Edit `~/.codex/config.toml`.

**Local (stdio):**

```toml
[mcp_servers.winreach]
command = "npx"
args = ["-y", "winreach-mcp", "--stdio"]
enabled = true
```

**Remote (HTTP + bearer):**

```toml
[mcp_servers.winreach]
url = "https://YOUR_WINREACH_HOST/mcp"
bearer_token_env_var = "WINREACH_TOKEN"
tool_timeout_sec = 120
default_tools_approval_mode = "prompt"
enabled = true
```

## Cursor

Create `.cursor/mcp.json` in your project (or `~/.cursor/mcp.json` globally).

**Local (stdio):**

```jsonc
{
  "mcpServers": {
    "winreach": {
      "command": "npx",
      "args": ["-y", "winreach-mcp", "--stdio"]
    }
  }
}
```

**Remote (HTTP + bearer):**

```jsonc
{
  "mcpServers": {
    "winreach": {
      "url": "https://YOUR_WINREACH_HOST/mcp",
      "headers": {
        "Authorization": "Bearer PASTE_TOKEN_HERE"
      }
    }
  }
}
```

---

## One-click Claude Desktop extension (DXT / `.mcpb`)

Claude Desktop extensions launch a **local** process, so the WinReach DXT drives
the `--stdio` local mode via `npx -y winreach-mcp --stdio`. (A remote WinReach
HTTP server cannot itself be a DXT — there is no local process to bundle; use the
Claude Desktop **remote** JSON form above for that.) The extension surfaces
`WINREACH_TOKEN` as a secure, user-editable field; leave it blank to mint an
ephemeral token.

The manifest lives at [`dxt/manifest.json`](../dxt/manifest.json). Pack it into an
installable `.mcpb`/`.dxt` bundle with Anthropic's DXT CLI:

```powershell
# From the repo root:
npx @anthropic-ai/dxt pack dxt winreach.mcpb
```

Then double-click `winreach.mcpb` (or drag it into Claude Desktop → Settings →
Extensions) to install. Requires the `winreach-mcp` npm package to be published so
`npx` can fetch it, and Node.js 24+ on the machine.

---

## Optional capabilities

By default WinReach exposes only the PowerShell tools. The extra tool families are
opt-in via environment variables on the server (set them wherever you launch
WinReach — a shell, the service config, or a client's `env` block):

- `WINREACH_ALLOW_BASH=1` — adds the `bash_*` Git Bash tools (one-shot + persistent
  sessions), under the same command policy and audit as PowerShell. Set
  `WINREACH_BASH_PATH` if `bash.exe` isn't at a standard Git-for-Windows path.
- `WINREACH_ALLOW_SCREENSHOT=1` — adds `take_screenshot`.
- `WINREACH_ALLOW_COMPUTER_USE=1` — adds `computer_use` (desktop input).
- `WINREACH_FILE_ROOT=<dir>` — adds `file_upload` / `file_download`, sandboxed to that dir.

See the [README configuration reference](../README.md#configuration) and
[SECURITY.md](../SECURITY.md) for the full list and hardening notes.

## Registries

- **MCP Registry** — [`server.json`](../server.json) describes the npm package
  (stdio) and the remote Streamable-HTTP endpoint.
- **Smithery** — [`smithery.yaml`](../smithery.yaml) launches the stdio server and
  exposes an optional bearer-token config field.
