/**
 * Types for the Git Bash tool family. These mirror the PowerShell shapes
 * (`src/powershell/types.ts`) so the shared tool helpers (`enforcePolicy`,
 * `auditResult`) and result formatting apply unchanged — a `BashResult` is
 * structurally a `PowerShellResult`.
 */

export type BashResult = {
  commandId: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated: boolean;
};

export type BashExecuteOptions = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
};

export type BashRuntimeOptions = {
  /** Explicit path to `bash.exe`; when unset the common Git Bash paths are probed. */
  bashPath?: string;
  defaultCwd: string;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
};

export type BashSessionInfo = {
  sessionId: string;
  createdAt: string;
  lastUsedAt: string;
  cwd: string;
};
