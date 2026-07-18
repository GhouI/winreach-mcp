import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./types.js";
import { registerPowerShellTools } from "./powershell.js";
import { registerBashTools } from "./bash.js";
import { registerScreenshotTools } from "./screenshot.js";
import { registerComputerUseTools } from "./computer-use.js";
import { registerFileTransferTools } from "./file-transfer.js";

export type { ToolContext } from "./types.js";

/**
 * Compose every tool family onto `server`. Each child decides for itself
 * whether its tools are exposed (per the principal's allowlist and the relevant
 * operator gates). Adding a new tool family is one new child module plus one
 * line here.
 */
export function registerTools(server: McpServer, ctx: ToolContext): void {
  registerPowerShellTools(server, ctx);
  registerBashTools(server, ctx);
  registerScreenshotTools(server, ctx);
  registerComputerUseTools(server, ctx);
  registerFileTransferTools(server, ctx);
}
