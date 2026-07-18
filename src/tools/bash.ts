import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeBash, toBashRuntime } from "../bash/shell.js";
import type { ToolContext } from "./types.js";
import {
  openSessionInputSchema,
  bashCommandInputSchema,
  bashSendInputSchema,
  bashCloseInputSchema
} from "./schemas.js";
import { enforcePolicy, auditResult, isBashAvailable } from "./helpers.js";
import { jsonToolResult } from "./results.js";

/**
 * Register the Git Bash command + session tools: one-shot execution and the
 * persistent-session lifecycle (open/send/close/list). This is the sibling of
 * `registerPowerShellTools` — same command policy, allowlist gating, and audit —
 * but it targets Git Bash's `bash.exe`. The whole family is opt-in: it is only
 * registered when the operator enabled bash (`WINREACH_ALLOW_BASH`) and
 * `bash.exe` is resolvable; each tool is then gated by the principal's `tools`
 * allowlist exactly like the PowerShell family.
 */
export function registerBashTools(server: McpServer, ctx: ToolContext): void {
  const { config, principal, audit, bashSessions, allowsTool } = ctx;

  if (!isBashAvailable(config)) {
    return;
  }

  const runtime = toBashRuntime(config);

  if (allowsTool("bash_execute")) {
    server.registerTool(
      "bash_execute",
      {
        title: "Execute Bash",
        description: "Run a one-shot Git Bash command.",
        inputSchema: bashCommandInputSchema
      },
      async (args) => {
        const blocked = await enforcePolicy(config, principal, audit, "bash_execute", args.command, args.cwd);
        if (blocked) {
          return blocked;
        }
        const result = await executeBash(runtime, args);
        await auditResult(audit, principal, "bash_execute", result, args.command, args.cwd);
        return jsonToolResult(result);
      }
    );
  }

  if (allowsTool("bash_open_session")) {
    server.registerTool(
      "bash_open_session",
      {
        title: "Open Bash Session",
        description: "Open a persistent Git Bash session.",
        inputSchema: openSessionInputSchema
      },
      async (args) => {
        const info = bashSessions.open(args.cwd, args.env);
        await audit.log({
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "bash_open_session",
          decision: "allowed",
          cwd: args.cwd,
          sessionId: info.sessionId
        });
        return jsonToolResult(info);
      }
    );
  }

  if (allowsTool("bash_send")) {
    server.registerTool(
      "bash_send",
      {
        title: "Send Bash Session Command",
        description: "Send a command to a persistent Git Bash session.",
        inputSchema: bashSendInputSchema
      },
      async ({ sessionId, ...args }) => {
        const blocked = await enforcePolicy(config, principal, audit, "bash_send", args.command, args.cwd, sessionId);
        if (blocked) {
          return blocked;
        }
        const result = await bashSessions.send(sessionId, args);
        await auditResult(audit, principal, "bash_send", result, args.command, args.cwd, sessionId);
        return jsonToolResult(result);
      }
    );
  }

  if (allowsTool("bash_close_session")) {
    server.registerTool(
      "bash_close_session",
      {
        title: "Close Bash Session",
        description: "Close a persistent Git Bash session.",
        inputSchema: bashCloseInputSchema
      },
      async ({ sessionId }) => {
        const closed = bashSessions.close(sessionId);
        await audit.log({
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "bash_close_session",
          decision: "allowed",
          sessionId
        });
        return jsonToolResult({ sessionId, closed });
      }
    );
  }

  if (allowsTool("bash_list_sessions")) {
    server.registerTool(
      "bash_list_sessions",
      {
        title: "List Bash Sessions",
        description: "List active persistent Git Bash sessions."
      },
      async () => jsonToolResult({ sessions: bashSessions.list() })
    );
  }
}
