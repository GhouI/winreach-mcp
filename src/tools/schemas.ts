import * as z from "zod/v4";

/**
 * Zod input schemas shared across the tool children. Kept here so the root
 * owns them and any tool that needs the same shape reuses it rather than
 * redefining the fields.
 */

export const commandInputSchema = {
  command: z.string().min(1).describe("PowerShell command to execute"),
  cwd: z.string().optional().describe("Working directory for this command"),
  env: z.record(z.string(), z.string()).optional().describe("Additional environment variables"),
  timeoutMs: z.number().positive().optional().describe("Command timeout in milliseconds"),
  maxOutputBytes: z.number().positive().optional().describe("Maximum bytes captured per stream")
};

export const openSessionInputSchema = {
  cwd: z.string().optional().describe("Working directory for the session"),
  env: z.record(z.string(), z.string()).optional().describe("Additional session environment variables")
};

export const sendInputSchema = {
  sessionId: z.string().min(1).describe("PowerShell session id"),
  ...commandInputSchema
};

export const closeInputSchema = {
  sessionId: z.string().min(1).describe("PowerShell session id")
};

export const screenshotInputSchema = {
  format: z
    .enum(["png", "jpeg"])
    .optional()
    .describe("Image format for the capture. Defaults to png."),
  timeoutMs: z.number().positive().optional().describe("Capture timeout in milliseconds")
};

export const fileUploadInputSchema = {
  path: z
    .string()
    .min(1)
    .describe("Destination path, relative to the configured file root (WINBRIDGE_FILE_ROOT)."),
  content: z.string().describe("File content, base64-encoded."),
  overwrite: z.boolean().optional().describe("Overwrite an existing file. Defaults to false.")
};

export const fileDownloadInputSchema = {
  path: z
    .string()
    .min(1)
    .describe("Source path, relative to the configured file root (WINBRIDGE_FILE_ROOT)."),
  deleteSource: z
    .boolean()
    .optional()
    .describe("Delete the source after a successful read, turning the copy into a move. Defaults to false.")
};

export const computerUseInputSchema = {
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
