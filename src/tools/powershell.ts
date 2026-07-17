import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executePowerShell } from "../powershell/shell.js";
import type { ToolContext } from "./types.js";
import { commandInputSchema, openSessionInputSchema, sendInputSchema, closeInputSchema } from "./schemas.js";
import { enforcePolicy, auditResult } from "./helpers.js";
import { jsonToolResult } from "./results.js";

/**
 * Register the PowerShell command + session tools: one-shot execution and the
 * persistent-session lifecycle (open/send/close/list).
 */
export function registerPowerShellTools(server: McpServer, ctx: ToolContext): void {
  const { config, principal, audit, sessions, allowsTool } = ctx;

  if (allowsTool("powershell_execute")) {
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
  }

  if (allowsTool("powershell_open_session")) {
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
  }

  if (allowsTool("powershell_send")) {
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
  }

  if (allowsTool("powershell_close_session")) {
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
  }

  if (allowsTool("powershell_list_sessions")) {
    server.registerTool(
      "powershell_list_sessions",
      {
        title: "List PowerShell Sessions",
        description: "List active persistent PowerShell sessions."
      },
      async () => jsonToolResult({ sessions: sessions.list() })
    );
  }
}
