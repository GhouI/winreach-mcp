import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { downloadFile, uploadFile } from "../fileTransfer.js";
import type { ToolContext } from "./types.js";
import { fileUploadInputSchema, fileDownloadInputSchema } from "./schemas.js";
import { jsonToolResult, fileDownloadToolResult } from "./results.js";

/**
 * Register the file upload/download tools. File transfer is only exposed when
 * the operator has configured a sandbox root; every path is then confined to
 * that root.
 */
export function registerFileTransferTools(server: McpServer, ctx: ToolContext): void {
  const { config, principal, audit, allowsTool } = ctx;

  if (!config.fileTransfer.enabled) {
    return;
  }

  const fileRuntime = { root: config.fileTransfer.root, maxBytes: config.fileTransfer.maxBytes };

  if (allowsTool("file_upload")) {
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
  }

  if (allowsTool("file_download")) {
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
}
