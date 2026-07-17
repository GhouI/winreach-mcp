import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { localhostHostValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import express from "express";
import * as z from "zod/v4";
import type { Request, Response } from "express";
import { createOriginGuard, createPrincipalAuthMiddleware, getRequestPrincipal } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createAuditLogger, type AuditLogger } from "./audit.js";
import { evaluatePolicies } from "./policy.js";
import type { Principal } from "./principals.js";
import { executePowerShell } from "./powershell/shell.js";
import { captureScreenshot } from "./powershell/screenshot.js";
import { performComputerAction, type ComputerAction, type ComputerUseResult } from "./powershell/input.js";
import { PowerShellSessionManager } from "./powershell/session.js";
import type { PowerShellResult, ScreenshotResult } from "./powershell/types.js";
import { downloadFile, uploadFile, type FileDownloadResult } from "./fileTransfer.js";

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

const screenshotInputSchema = {
  format: z
    .enum(["png", "jpeg"])
    .optional()
    .describe("Image format for the capture. Defaults to png."),
  timeoutMs: z.number().positive().optional().describe("Capture timeout in milliseconds")
};

/**
 * Whether `principal` may capture the screen. Screen capture is off unless the
 * operator enabled it; when enabled, an empty role list allows any principal,
 * otherwise the principal's role must be listed.
 */
function isScreenshotAllowed(config: AppConfig, principal: Principal): boolean {
  if (!config.screenshot.enabled) {
    return false;
  }
  const roles = config.screenshot.allowedRoles;
  return roles.length === 0 || roles.includes(principal.role);
}

const computerUseInputSchema = {
  action: z
    .enum([
      "mouse_move",
      "left_click",
      "right_click",
      "middle_click",
      "double_click",
      "left_mouse_down",
      "left_mouse_up",
      "type",
      "key",
      "scroll",
      "cursor_position",
      "wait"
    ])
    .describe("The desktop input action to perform."),
  coordinate: z
    .tuple([z.number().int(), z.number().int()])
    .optional()
    .describe("[x, y] absolute pixel in the same virtual-desktop space as take_screenshot."),
  text: z.string().optional().describe("For action 'type': the text to type verbatim (any Unicode)."),
  keys: z
    .string()
    .optional()
    .describe("For action 'key': a '+'-separated chord, e.g. 'ctrl+c', 'alt+F4', 'ctrl+shift+Escape'."),
  scroll_direction: z.enum(["up", "down", "left", "right"]).optional().describe("For action 'scroll'."),
  scroll_amount: z.number().int().positive().max(100).optional().describe("For action 'scroll': wheel notches."),
  duration_ms: z.number().int().positive().max(60_000).optional().describe("For action 'wait': milliseconds to pause.")
};

type ComputerUseArgs = {
  action: string;
  coordinate?: [number, number];
  text?: string;
  keys?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration_ms?: number;
};

/**
 * Whether `principal` may drive the desktop. Off unless the operator enabled it;
 * when enabled, an empty role list allows any principal, otherwise the
 * principal's role must be listed.
 */
function isComputerUseAllowed(config: AppConfig, principal: Principal): boolean {
  if (!config.computerUse.enabled) {
    return false;
  }
  const roles = config.computerUse.allowedRoles;
  return roles.length === 0 || roles.includes(principal.role);
}

/** A simple token-bucket limiter; `take()` returns false when the bucket is empty. */
function createRateLimiter(perSec: number): () => boolean {
  let tokens = perSec;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(perSec, tokens + ((now - last) / 1000) * perSec);
    last = now;
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  };
}

/**
 * Validate the cross-field requirements of a computer_use call and build the
 * typed action. Returns an error message string instead of the action when the
 * arguments are inconsistent (e.g. `type` with no `text`).
 */
function buildComputerAction(args: ComputerUseArgs): { action: ComputerAction } | { error: string } {
  const needsCoordinate = ["mouse_move", "left_click", "right_click", "middle_click", "double_click"];
  if (needsCoordinate.includes(args.action) && !args.coordinate) {
    return { error: `Action '${args.action}' requires a coordinate.` };
  }
  switch (args.action) {
    case "mouse_move":
    case "left_click":
    case "right_click":
    case "middle_click":
    case "double_click":
      return { action: { type: args.action, coordinate: args.coordinate! } };
    case "left_mouse_down":
    case "left_mouse_up":
      return { action: { type: args.action, coordinate: args.coordinate } };
    case "type":
      if (!args.text) {
        return { error: "Action 'type' requires non-empty text." };
      }
      return { action: { type: "type", text: args.text } };
    case "key":
      if (!args.keys) {
        return { error: "Action 'key' requires a key chord." };
      }
      return { action: { type: "key", keys: args.keys } };
    case "scroll":
      if (!args.scroll_direction) {
        return { error: "Action 'scroll' requires scroll_direction." };
      }
      return {
        action: {
          type: "scroll",
          direction: args.scroll_direction,
          amount: args.scroll_amount ?? 3,
          coordinate: args.coordinate
        }
      };
    case "cursor_position":
      return { action: { type: "cursor_position" } };
    case "wait":
      if (!args.duration_ms) {
        return { error: "Action 'wait' requires duration_ms." };
      }
      return { action: { type: "wait", durationMs: args.duration_ms } };
    default:
      return { error: `Unknown action '${args.action}'.` };
  }
}

const fileUploadInputSchema = {
  path: z
    .string()
    .min(1)
    .describe("Destination path, relative to the configured file root (WINBRIDGE_FILE_ROOT)."),
  content: z.string().describe("File content, base64-encoded."),
  overwrite: z.boolean().optional().describe("Overwrite an existing file. Defaults to false.")
};

const fileDownloadInputSchema = {
  path: z
    .string()
    .min(1)
    .describe("Source path, relative to the configured file root (WINBRIDGE_FILE_ROOT)."),
  deleteSource: z
    .boolean()
    .optional()
    .describe("Delete the source after a successful read, turning the copy into a move. Defaults to false.")
};

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
  // one it sees every tool (subject to the per-tool gates below).
  const allowsTool = (tool: string): boolean =>
    principal.tools === undefined || principal.tools.includes(tool);

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

  // Screen capture is a read/exfiltration capability, so it is only exposed when
  // the operator has enabled it (WINBRIDGE_ALLOW_SCREENSHOT) for a role that
  // includes this principal — and only if the principal's tool allowlist permits it.
  if (isScreenshotAllowed(config, principal) && allowsTool("take_screenshot")) {
    server.registerTool(
      "take_screenshot",
      {
        title: "Take Screenshot",
        description:
          "Capture the current screen of the Windows host as a PNG or JPEG image. Captures the full virtual desktop across all monitors. Requires an active interactive desktop session.",
        inputSchema: screenshotInputSchema
      },
      async (args) => {
        const result = await captureScreenshot(config, {
          ...args,
          dir: config.screenshot.dir,
          retentionMs: config.screenshot.retentionMs
        });
        // The call is authorized (an unauthorized principal never reaches here,
        // since the tool is only registered when allowed). A runtime capture
        // failure is recorded in `reason`, mirroring how the other tools log a
        // successful authorization with the failure carried in the result.
        await audit.log({
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "take_screenshot",
          decision: "allowed",
          durationMs: result.durationMs,
          bytes: result.success ? result.bytes : undefined,
          path: result.path,
          reason: result.success ? undefined : result.error
        });
        return screenshotToolResult(result);
      }
    );
  }

  // Desktop input ("computer use") is the most powerful capability: GUI
  // actuation bypasses the command policy entirely, so it is only exposed when
  // the operator enabled it for this principal's role, and only if the tool
  // allowlist permits it.
  if (isComputerUseAllowed(config, principal) && allowsTool("computer_use")) {
    const cu = config.computerUse;
    // One token bucket per principal server instance, so a runaway agent is
    // capped without affecting other principals.
    const takeToken = createRateLimiter(cu.maxActionsPerSec);

    server.registerTool(
      "computer_use",
      {
        title: "Computer Use (desktop input)",
        description:
          "Control the Windows desktop with mouse and keyboard, as a human would: move/click the mouse, type text, press key chords, and scroll. Coordinates are absolute pixels in the same virtual-desktop space as take_screenshot. Requires an active interactive desktop session; Ctrl+Alt+Del and the secure desktop (UAC/lock screen) cannot be driven.",
        inputSchema: computerUseInputSchema
      },
      async (args: ComputerUseArgs) => {
        const auditBase = {
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "computer_use",
          action: args.action
        } as const;

        // Kill switch: an operator can freeze all actuation by creating the halt file.
        if (cu.haltFile && existsSync(cu.haltFile)) {
          await audit.log({ ...auditBase, decision: "blocked", reason: "halt file present" });
          return computerUseError("Computer use is halted by the operator (halt file present).");
        }

        // Per-principal rate limit.
        if (!takeToken()) {
          await audit.log({ ...auditBase, decision: "blocked", reason: "rate limited" });
          return computerUseError("Rate limit exceeded for computer_use. Slow down and retry.");
        }

        // Key-chord denylist (a speed bump against obvious foot-guns like win+r).
        if (args.action === "key" && args.keys && cu.keyDenylist.some((re) => re.test(args.keys!))) {
          await audit.log({ ...auditBase, decision: "blocked", keys: args.keys, reason: "key chord denied" });
          return computerUseError(`Key chord '${args.keys}' is blocked by policy.`);
        }

        const built = buildComputerAction(args);
        if ("error" in built) {
          await audit.log({ ...auditBase, decision: "error", reason: built.error });
          return computerUseError(built.error);
        }

        const result = await performComputerAction(config, built.action, { timeoutMs: config.defaultTimeoutMs });

        // Audit the authorized call. Typed text is redacted by default: only its
        // length and a truncated hash are recorded unless the operator opted in.
        const textFields =
          args.action === "type" && args.text !== undefined
            ? {
                textLength: args.text.length,
                textHash: createHash("sha256").update(args.text, "utf8").digest("hex").slice(0, 16),
                text: cu.auditText ? args.text : undefined
              }
            : {};
        await audit.log({
          ...auditBase,
          decision: "allowed",
          coordinate: args.coordinate ? { x: args.coordinate[0], y: args.coordinate[1] } : undefined,
          keys: args.action === "key" ? args.keys : undefined,
          durationMs: result.durationMs,
          reason: result.success ? undefined : result.error,
          ...textFields
        });

        return computerUseToolResult(result);
      }
    );
  }

  // File transfer is only exposed when the operator has configured a sandbox
  // root; every path is then confined to that root.
  if (config.fileTransfer.enabled) {
    const fileRuntime = { root: config.fileTransfer.root, maxBytes: config.fileTransfer.maxBytes };

    if (allowsTool("file_upload"))
    server.registerTool(
      "file_upload",
      {
        title: "Upload File",
        description:
          "Write a base64-encoded file to the Windows host, inside the configured file root. Refuses to overwrite unless overwrite is set. Use this to put files on the server.",
        inputSchema: fileUploadInputSchema
      },
      async (args) => {
        const result = uploadFile(fileRuntime, args);
        // Record the caller-supplied (relative) path on both success and
        // failure so a rejected traversal/escape probe is visible in the log
        // and distinguishable from a normal transfer.
        await audit.log({
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "file_upload",
          decision: result.success ? "allowed" : "blocked",
          path: result.relativePath ?? args.path,
          bytes: result.success ? result.bytes : undefined,
          reason: result.success ? undefined : result.error
        });
        // Keep the server-side absolute path out of the client payload (audited).
        const { path: _serverPath, ...payload } = result;
        return jsonToolResult(payload, !result.success);
      }
    );

    if (allowsTool("file_download"))
    server.registerTool(
      "file_download",
      {
        title: "Download File",
        description:
          "Read a file from the Windows host (inside the configured file root) and return it base64-encoded. Set deleteSource to move it (delete the server copy after a successful read).",
        inputSchema: fileDownloadInputSchema
      },
      async (args) => {
        const result = downloadFile(fileRuntime, args);
        await audit.log({
          time: new Date().toISOString(),
          principal: principal.name,
          role: principal.role,
          tool: "file_download",
          decision: result.success ? "allowed" : "blocked",
          path: result.relativePath ?? args.path,
          bytes: result.success ? result.bytes : undefined,
          reason: result.success ? undefined : result.error
        });
        return fileDownloadToolResult(result);
      }
    );
  }

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

function jsonToolResult(value: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    ...(isError ? { isError: true as const } : {})
  };
}

/**
 * Format a file download. The server-side absolute path is stripped from the
 * client-facing payload (it is kept in the audit log); the base64 content is the
 * payload the caller needs, so it is returned.
 */
function fileDownloadToolResult(result: FileDownloadResult) {
  if (!result.success) {
    return jsonToolResult(
      { commandId: result.commandId, success: false, error: result.error ?? "Download failed." },
      true
    );
  }
  const { path: _serverPath, ...payload } = result;
  return jsonToolResult(payload);
}

/** A computer_use failure result (validation, policy, or halt) as an MCP error. */
function computerUseError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error: message }) }],
    isError: true
  };
}

/** Format a performed computer_use action for the caller (text-only JSON). */
function computerUseToolResult(result: ComputerUseResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            commandId: result.commandId,
            success: result.success,
            action: result.action,
            cursor_position: result.cursor,
            virtual_screen: result.virtualScreen,
            durationMs: result.durationMs,
            error: result.error
          },
          null,
          2
        )
      }
    ],
    isError: !result.success
  };
}

function screenshotToolResult(result: ScreenshotResult) {
  if (!result.success) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              commandId: result.commandId,
              success: false,
              durationMs: result.durationMs,
              error: result.error ?? "Screen capture failed."
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }

  // Do not surface the server-side file path or raw base64 to the caller; the
  // path is internal (recorded in the audit log instead) and the image bytes are
  // already returned as the image content block.
  const { base64, path: _serverPath, ...metadata } = result;
  return {
    content: [
      {
        type: "image" as const,
        data: base64,
        mimeType: result.mimeType
      },
      {
        type: "text" as const,
        text: JSON.stringify(metadata, null, 2)
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
