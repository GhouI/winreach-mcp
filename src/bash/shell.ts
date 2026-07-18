import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createOutputBuffer } from "../powershell/output.js";
import type { BashExecuteOptions, BashResult, BashRuntimeOptions } from "./types.js";

/**
 * Common locations Git for Windows installs `bash.exe`. Probed in order when no
 * explicit `WINREACH_BASH_PATH` is configured.
 */
function candidateBashPaths(): string[] {
  const paths = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe"
  ];

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    paths.push(join(localAppData, "Programs", "Git", "bin", "bash.exe"));
  }

  return paths;
}

/**
 * Resolve the Git Bash executable. An explicit path (from `WINREACH_BASH_PATH`)
 * is trusted and returned as-is. Otherwise the common Git-for-Windows install
 * paths are probed. On non-Windows hosts `bash` is assumed on `PATH` (useful for
 * local dev/CI). Returns `undefined` when bash cannot be located, so the tool
 * family can decline to register.
 */
export function resolveBashPath(configuredBashPath?: string): string | undefined {
  if (configuredBashPath) {
    return configuredBashPath;
  }

  for (const candidate of candidateBashPaths()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform !== "win32") {
    return "bash";
  }

  return undefined;
}

/**
 * Build a bash runtime from the app config. Structural typing avoids importing
 * `AppConfig` into the bash module; any object with these fields works.
 */
export function toBashRuntime(config: {
  bash: { path?: string };
  defaultCwd: string;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
}): BashRuntimeOptions {
  return {
    bashPath: config.bash.path,
    defaultCwd: config.defaultCwd,
    defaultTimeoutMs: config.defaultTimeoutMs,
    maxOutputBytes: config.maxOutputBytes
  };
}

/**
 * Run a one-shot Git Bash command via `bash -lc "<command>"`. Mirrors
 * `executePowerShell`: same output buffering, timeout, cwd/env handling, and
 * result shape. Uses a login shell (`-l`) so the profile/PATH set up by Git for
 * Windows (and its POSIX tooling) is available.
 */
export async function executeBash(
  runtime: BashRuntimeOptions,
  options: BashExecuteOptions
): Promise<BashResult> {
  const commandId = randomUUID();
  const started = Date.now();
  const stdout = createOutputBuffer(options.maxOutputBytes ?? runtime.maxOutputBytes);
  const stderr = createOutputBuffer(options.maxOutputBytes ?? runtime.maxOutputBytes);
  const timeoutMs = options.timeoutMs ?? runtime.defaultTimeoutMs;
  const bashPath = resolveBashPath(runtime.bashPath);

  if (!bashPath) {
    return {
      commandId,
      stdout: "",
      stderr: "Git Bash (bash.exe) is not available. Set WINREACH_BASH_PATH.",
      exitCode: 1,
      durationMs: Date.now() - started,
      truncated: false
    };
  }

  const child = spawn(bashPath, ["-lc", options.command], {
    cwd: options.cwd ?? runtime.defaultCwd,
    env: { ...process.env, ...options.env },
    windowsHide: true
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);

  child.stdout?.on("data", (chunk: Buffer) => stdout.append(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.append(chunk));

  return await new Promise((resolve) => {
    child.on("error", (error) => {
      clearTimeout(timer);
      stderr.append(error.message);
      resolve({
        commandId,
        stdout: stdout.text(),
        stderr: stderr.text(),
        exitCode: 1,
        durationMs: Date.now() - started,
        truncated: stdout.truncated() || stderr.truncated()
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        stderr.append(`Command timed out after ${timeoutMs}ms`);
      }

      resolve({
        commandId,
        stdout: stdout.text(),
        stderr: stderr.text(),
        exitCode: timedOut ? null : code,
        durationMs: Date.now() - started,
        truncated: stdout.truncated() || stderr.truncated()
      });
    });
  });
}
