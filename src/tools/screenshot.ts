import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { captureScreenshot } from "../powershell/screenshot.js";
import type { ToolContext } from "./types.js";
import { screenshotInputSchema } from "./schemas.js";
import { isScreenshotAllowed } from "./helpers.js";
import { screenshotToolResult } from "./results.js";

/**
 * Register the screen-capture tool. Screen capture is a read/exfiltration
 * capability, so it is only exposed when the operator has enabled it
 * (WINBRIDGE_ALLOW_SCREENSHOT) for a role that includes this principal — and
 * only if the principal's tool allowlist permits it.
 */
export function registerScreenshotTools(server: McpServer, ctx: ToolContext): void {
  const { config, principal, audit, allowsTool } = ctx;

  if (!(isScreenshotAllowed(config, principal) && allowsTool("take_screenshot"))) {
    return;
  }

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
