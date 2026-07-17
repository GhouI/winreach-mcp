import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAuditLogger } from "./audit.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { createWinReachMcpServer } from "./mcpServer.js";
import { PowerShellSessionManager } from "./powershell/session.js";
import { createPrimaryPrincipal, type Principal } from "./principals.js";
import { generateToken } from "./token.js";

/**
 * Run WinReach over the MCP stdio transport for a local, trusted launcher (an
 * MCP client such as Claude Desktop that spawns `npx winreach-mcp --stdio`).
 *
 * Unlike HTTP mode there is no network exposure and no per-request auth: the
 * process is owned by the launching user, so it runs as a single implicit
 * full-access admin principal. Its bearer token comes from WINREACH_TOKEN when
 * set, otherwise an ephemeral in-memory token is minted so the same code paths
 * (config, audit, sessions) work unchanged. All other WINREACH_* config
 * (policies, screenshot/computer-use/file-transfer gates, audit log) is honored.
 *
 * Nothing is written to stdout except the JSON-RPC stream — diagnostics go to
 * stderr — so the transport framing stays clean.
 */
export async function runStdio(): Promise<void> {
  // loadConfig() requires a principal source. In stdio mode we trust the local
  // launcher, so ensure a token exists (reusing WINREACH_TOKEN if provided)
  // before building the config.
  const token = process.env.WINREACH_TOKEN?.trim() || generateToken();
  if (!process.env.WINREACH_TOKEN?.trim()) {
    process.env.WINREACH_TOKEN = token;
    console.error("WinReach: no WINREACH_TOKEN set; using an ephemeral in-memory admin token for this stdio session.");
  }

  const baseConfig = loadConfig();

  // Collapse to exactly one implicit admin principal regardless of any
  // WINREACH_PRINCIPALS the environment may carry: in stdio mode the launcher is
  // the sole, trusted identity.
  const principal: Principal = createPrimaryPrincipal(token, { allow: [], deny: [] });
  const config: AppConfig = { ...baseConfig, principals: [principal] };

  const sessions = new PowerShellSessionManager(config);
  const audit = createAuditLogger(config.auditLogPath);
  const server = createWinReachMcpServer(config, sessions, principal, audit);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    sessions.closeAll();
    void server.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // When the client closes stdin the transport ends; exit cleanly.
  transport.onclose = shutdown;

  await server.connect(transport);
  console.error("WinReach MCP ready on stdio transport.");
}
