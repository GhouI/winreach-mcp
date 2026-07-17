import type { FileDownloadResult } from "../fileTransfer.js";
import type { ScreenshotResult } from "../powershell/types.js";

/** Wrap an arbitrary value as a JSON text tool result. */
export function jsonToolResult(value: unknown, isError = false) {
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
export function fileDownloadToolResult(result: FileDownloadResult) {
  if (!result.success) {
    return jsonToolResult(
      { commandId: result.commandId, success: false, error: result.error ?? "Download failed." },
      true
    );
  }
  const { path: _serverPath, ...payload } = result;
  return jsonToolResult(payload);
}

export function screenshotToolResult(result: ScreenshotResult) {
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
