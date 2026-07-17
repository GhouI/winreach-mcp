import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { performComputerAction, type ComputerAction, type ComputerUseResult } from "../powershell/input.js";
import type { ToolContext } from "./types.js";
import { computerUseInputSchema } from "./schemas.js";
import { isComputerUseAllowed } from "./helpers.js";

type ComputerUseArgs = {
  action: string;
  coordinate?: [number, number];
  text?: string;
  keys?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration_ms?: number;
};

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
 * typed action. Returns an error message instead of the action when the
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

/**
 * Register the desktop-input tool. Computer use is the most powerful capability:
 * GUI actuation bypasses the command policy entirely (an agent can type a
 * blocked command into a window), so it is only exposed when the operator
 * enabled it for this principal's role, and only if the tool allowlist permits
 * it. A halt file, per-principal rate limit, and key-chord denylist bound the
 * blast radius, and typed text is redacted from the audit log by default.
 */
export function registerComputerUseTools(server: McpServer, ctx: ToolContext): void {
  const { config, principal, audit, allowsTool } = ctx;

  if (!(isComputerUseAllowed(config, principal) && allowsTool("computer_use"))) {
    return;
  }

  const cu = config.computerUse;
  // One token bucket per principal server instance, so a runaway agent is capped
  // without affecting other principals.
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
