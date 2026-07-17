import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { localhostHostValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import express from "express";
import type { Request, Response } from "express";
import { createOriginGuard, createPrincipalAuthMiddleware, getRequestPrincipal } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createAuditLogger, type AuditLogger } from "./audit.js";
import type { Principal } from "./principals.js";
import { PowerShellSessionManager } from "./powershell/session.js";
import type { PowerShellResult } from "./powershell/types.js";
import { registerTools, type ToolContext } from "./tools/index.js";

export function createWinBridgeMcpServer(
  config: AppConfig,
  sessions: PowerShellSessionManager,
  principal: Principal,
  audit: AuditLogger
): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version
  }, {
    instructions: [
      "WinBridge provides headless PowerShell access to the Windows host running this MCP server.",
      "Use powershell_execute for isolated commands.",
      "Use powershell_open_session, powershell_send, and powershell_close_session when state must persist across commands, such as variables, imported modules, or working directory.",
      "Commands run as the operating system user that launched WinBridge.",
      "Command allow/deny policies may block some commands; blocked calls return an error explaining why.",
      "A principal may also be limited to a subset of tools; tools it cannot use are simply not offered.",
      "Treat every tool call as remote command execution and avoid sending secrets unless the operator explicitly intends that."
    ].join(" ")
  });

  // A principal with a `tools` allowlist only sees the tools it lists; without
  // one it sees every tool (subject to the per-tool gates inside each child).
  const allowsTool = (tool: string): boolean =>
    principal.tools === undefined || principal.tools.includes(tool);

  const ctx: ToolContext = { config, sessions, principal, audit, allowsTool };
  registerTools(server, ctx);

  return server;
}

/**
 * JSON body limit, sized to fit a base64-encoded `file_upload` payload plus the
 * JSON-RPC envelope. The SDK's `createMcpExpressApp` hardcodes body-parser's
 * 100 kB default, which would reject uploads far below `WINBRIDGE_MAX_FILE_BYTES`
 * with an opaque HTTP 413; this is why we build the app (and mount the parser)
 * ourselves.
 */
function jsonBodyLimitBytes(config: AppConfig): number {
  const DEFAULT_JSON_LIMIT = 100 * 1024;
  const ENVELOPE_OVERHEAD = 64 * 1024;
  // base64 inflates by ~4/3; add slack for the JSON-RPC envelope.
  const uploadLimit = config.fileTransfer.enabled
    ? Math.ceil(config.fileTransfer.maxBytes * 4 / 3) + ENVELOPE_OVERHEAD
    : 0;
  return Math.max(DEFAULT_JSON_LIMIT, uploadLimit);
}

/**
 * Build the base Express app with localhost DNS-rebinding protection (mirroring
 * the SDK's createMcpExpressApp). Body parsing is intentionally NOT added here:
 * it is mounted after auth in createWinBridgeApp so an unauthenticated client
 * cannot make the server buffer and parse a large (up to ~maxBytes*4/3) body.
 */
function createMcpApp(config: AppConfig) {
  const app = express();
  const localhostHosts = ["127.0.0.1", "localhost", "::1"];
  if (localhostHosts.includes(config.host)) {
    app.use(localhostHostValidation());
  } else if (config.host === "0.0.0.0" || config.host === "::") {
    console.warn(
      `Warning: Server is binding to ${config.host} without DNS rebinding protection. ` +
        "Restrict access with a firewall, WINBRIDGE_ALLOWED_ORIGINS, or a tunnel."
    );
  }
  return app;
}

export function createWinBridgeApp(config: AppConfig) {
  const sessions = new PowerShellSessionManager(config);
  const audit = createAuditLogger(config.auditLogPath);
  const app = createMcpApp(config);

  app.use(createOriginGuard(config.allowedOrigins));
  app.use(config.endpointPath, createPrincipalAuthMiddleware(config.principals));

  // Parse the JSON body only after auth has passed, and only on the MCP POST
  // route, so an unauthenticated or wrong-path request is never buffered/parsed
  // up to the (large) upload limit.
  const parseJsonBody = express.json({ limit: jsonBodyLimitBytes(config) });

  app.post(config.endpointPath, parseJsonBody, async (req: Request, res: Response) => {
    const principal = getRequestPrincipal(res);
    if (!principal) {
      // Should never happen: the auth middleware rejects unauthenticated requests.
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Missing or invalid bearer token" },
        id: null
      });
      return;
    }

    const server = createWinBridgeMcpServer(config, sessions, principal, audit);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  });

  app.get(config.endpointPath, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed"
      },
      id: null
    });
  });

  app.delete(config.endpointPath, (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed"
      },
      id: null
    });
  });

  return { app, sessions, audit };
}

export function createCommandId(): string {
  return randomUUID();
}

export function isPowerShellResult(value: unknown): value is PowerShellResult {
  return typeof value === "object" && value !== null && "commandId" in value;
}
