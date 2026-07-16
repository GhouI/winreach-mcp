export type PowerShellResult = {
  commandId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated: boolean;
};

export type ExecuteOptions = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type PowerShellRuntimeOptions = {
  shellPath?: string;
  defaultCwd: string;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
};

export type SessionInfo = {
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
  cwd: string;
};

export type ScreenshotFormat = "png" | "jpeg";

export type ScreenshotOptions = {
  format?: ScreenshotFormat;
  timeoutMs?: number;
  /** Server-owned directory to write the capture to. Defaults to a temp subdir. */
  dir?: string;
  /** Delete captures in `dir` older than this many ms before capturing. */
  retentionMs?: number;
};

export type ScreenshotResult = {
  commandId: string;
  success: boolean;
  format: ScreenshotFormat;
  mimeType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  base64: string;
  /** Server-side path the capture was saved to (kept until the retention sweep). */
  path?: string;
  durationMs: number;
  error?: string;
};
