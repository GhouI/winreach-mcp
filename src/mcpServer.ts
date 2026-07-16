import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import * as z from "zod/v4";
import type { Request, Response } from "express";
import { createOriginGuard, createPrincipalAuthMiddleware, getRequestPrincipal } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createAuditLogger, type AuditLogger } from "./audit.js";
import { evaluatePolicies } from "./policy.js";
import type { Principal } from "./principals.js";
import { executePowerShell } from "./powershell/shell.js";
import { PowerShellSessionManager } from "./powershell/session.js";
import type { PowerShellResult } from "./powershell/types.js";

const commandInputSchema = {
  command: z.string().min(1).describe("PowerShell command to execute"),
  cwd: z.string().optional().describe("Working directory for this command"),
  env: z.record(z.string(), z.string()).optional().describe("Additional environment variables"),
  timeoutMs: z.number().positive().optional().describe("Command timeout in milliseconds"),
  maxOutputBytes: z.number().positive().optional().describe("Maximum bytes captured per stream")
};

const openSessionInputSchema = {
  cwd: z.string().optional().describe("Working directory for the session"),
  env: z.record(z.string(), z.string()).optional().describe("Additional session environment variables")
};

const sendInputSchema = {
  sessionId: z.string().min(1).describe("PowerShell session id"),
  ...commandInputSchema
};

const closeInputSchema = {
  sessionId: z.string().min(1).describe("PowerShell session id")
};

/**
 * Enforce the global + per-principal command policy before a command runs.
 * Returns a blocked tool result (and audits the denial) when the command is not
 * permitted, or undefined when it may proceed.
 */
async function enforcePolicy(
  config: AppConfig,
  principal: Principal,
  audit: AuditLogger,
  tool: string,
  command: string,
  cwd: string | undefined,
  sessionId?: string
) {
  const decision = evaluatePolicies(command, [
    { source: "global", policy: config.globalPolicy },
    { source: principal.name, policy: principal.policy }
  ]);

  if (decision.allowed) {
    return undefined;
  }

  await audit.log({
    time: new Date().toISOString(),
    principal: principal.name,
    role: principal.role,
    tool,
    decision: "blocked",
    command,
    cwd,
    sessionId,
    reason: decision.reason
  });

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { blocked: true, reason: decision.reason, matchedRule: decision.matchedRule },
          null,
          2
        )
      }
    ]
  };
}

async function auditResult(
  audit: AuditLogger,
  principal: Principal,
  tool: string,
  result: PowerShellResult,
  command: string,
  cwd: string | undefined,
  sessionId?: string
): Promise<void> {
  await audit.log({
    time: new Date().toISOString(),
    principal: principal.name,
    role: principal.role,
    tool,
    decision: "allowed",
    command,
    cwd,
    sessionId,
    exitCode: result.exitCode,
    durationMs: result.durationMs
  });
}

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
      "Treat every tool call as remote command execution and avoid sending secrets unless the operator explicitly intends that."
    ].join(" ")
  });

  server.registerTool(
    "powershell_execute",
    {
      title: "Execute PowerShell",
      description: "Run a one-shot headless PowerShell command.",
      inputSchema: commandInputSchema
    },
    async (args) => {
      const blocked = await enforcePolicy(config, principal, audit, "powershell_execute", args.command, args.cwd);
      if (blocked) {
        return blocked;
      }
      const result = await executePowerShell(config, args);
      await auditResult(audit, principal, "powershell_execute", result, args.command, args.cwd);
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "powershell_open_session",
    {
      title: "Open PowerShell Session",
      description: "Open a persistent headless PowerShell session.",
      inputSchema: openSessionInputSchema
    },
    async (args) => {
      const info = sessions.open(args.cwd, args.env);
      await audit.log({
        time: new Date().toISOString(),
        principal: principal.name,
        role: principal.role,
        tool: "powershell_open_session",
        decision: "allowed",
        cwd: args.cwd,
        sessionId: info.sessionId
      });
      return jsonToolResult(info);
    }
  );

  server.registerTool(
    "powershell_send",
    {
      title: "Send PowerShell Session Command",
      description: "Send a command to a persistent PowerShell session.",
      inputSchema: sendInputSchema
    },
    async ({ sessionId, ...args }) => {
      const blocked = await enforcePolicy(
        config,
        principal,
        audit,
        "powershell_send",
        args.command,
        args.cwd,
        sessionId
      );
      if (blocked) {
        return blocked;
      }
      const result = await sessions.send(sessionId, args);
      await auditResult(audit, principal, "powershell_send", result, args.command, args.cwd, sessionId);
      return jsonToolResult(result);
    }
  );

  server.registerTool(
    "powershell_close_session",
    {
      title: "Close PowerShell Session",
      description: "Close a persistent PowerShell session.",
      inputSchema: closeInputSchema
    },
    async ({ sessionId }) => {
      const closed = sessions.close(sessionId);
      await audit.log({
        time: new Date().toISOString(),
        principal: principal.name,
        role: principal.role,
        tool: "powershell_close_session",
        decision: "allowed",
        sessionId
      });
      return jsonToolResult({ sessionId, closed });
    }
  );

  server.registerTool(
    "powershell_list_sessions",
    {
      title: "List PowerShell Sessions",
      description: "List active persistent PowerShell sessions."
    },
    async () => jsonToolResult({ sessions: sessions.list() })
  );

  return server;
}

export function createWinBridgeApp(config: AppConfig) {
  const sessions = new PowerShellSessionManager(config);
  const audit = createAuditLogger(config.auditLogPath);
  const app = createMcpExpressApp({ host: config.host });

  app.use(createOriginGuard(config.allowedOrigins));
  app.use(config.endpointPath, createPrincipalAuthMiddleware(config.principals));

  app.post(config.endpointPath, async (req: Request, res: Response) => {
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

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function createCommandId(): string {
  return randomUUID();
}

export function isPowerShellResult(value: unknown): value is PowerShellResult {
  return typeof value === "object" && value !== null && "commandId" in value;
}
