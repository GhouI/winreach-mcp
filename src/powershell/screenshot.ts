import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executePowerShell } from "./shell.js";
import type {
  PowerShellRuntimeOptions,
  ScreenshotFormat,
  ScreenshotOptions,
  ScreenshotResult
} from "./types.js";

type FormatMeta = {
  extension: string;
  mimeType: string;
  imageFormat: "Png" | "Jpeg";
};

const FORMAT_META: Record<ScreenshotFormat, FormatMeta> = {
  png: { extension: "png", mimeType: "image/png", imageFormat: "Png" },
  jpeg: { extension: "jpg", mimeType: "image/jpeg", imageFormat: "Jpeg" }
};

/** Filename prefix for every capture, used to scope the retention sweep. */
const SCREENSHOT_PREFIX = "winbridge-screenshot-";

export function defaultScreenshotDir(): string {
  return join(tmpdir(), "winbridge-screenshots");
}

/**
 * Delete captures in `dir` whose mtime is older than `retentionMs`. Only files
 * this module wrote (matching `SCREENSHOT_PREFIX`) are considered, so a
 * misconfigured directory cannot cause unrelated files to be removed. Best
 * effort: missing directories and per-file errors are ignored. Returns the
 * number of files deleted.
 */
export function sweepOldScreenshots(dir: string, retentionMs: number): number {
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) {
    return 0;
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - retentionMs;
  let removed = 0;
  for (const name of entries) {
    if (!name.startsWith(SCREENSHOT_PREFIX)) {
      continue;
    }
    const full = join(dir, name);
    try {
      if (statSync(full).mtimeMs < cutoff) {
        rmSync(full);
        removed += 1;
      }
    } catch {
      // Ignore files that vanish or cannot be stat'd/removed.
    }
  }
  return removed;
}

/** Escape a Windows path for embedding inside a single-quoted PowerShell string. */
function quoteForPowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * Build the PowerShell command that captures the full virtual screen (all
 * monitors) to `outputPath` and prints its pixel dimensions as `WIDTHxHEIGHT`.
 */
export function buildScreenshotCommand(outputPath: string, format: ScreenshotFormat): string {
  const imageFormat = FORMAT_META[format].imageFormat;
  return [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "Add-Type -AssemblyName System.Drawing;",
    "$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen;",
    "$bmp = New-Object System.Drawing.Bitmap([int]$bounds.Width, [int]$bounds.Height);",
    "$graphics = [System.Drawing.Graphics]::FromImage($bmp);",
    "try {",
    "  $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size);",
    `  $bmp.Save(${quoteForPowerShell(outputPath)}, [System.Drawing.Imaging.ImageFormat]::${imageFormat});`,
    "} finally {",
    "  $graphics.Dispose();",
    "  $bmp.Dispose();",
    "}",
    "Write-Output ('{0}x{1}' -f $bounds.Width, $bounds.Height)"
  ].join(" ");
}

function parseDimensions(stdout: string): { width: number | null; height: number | null } {
  const match = stdout.match(/(\d+)x(\d+)/);
  if (!match) {
    return { width: null, height: null };
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** Best-effort deletion of a single capture file. */
function removeIfPresent(path: string): void {
  if (existsSync(path)) {
    try {
      rmSync(path);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

/**
 * Capture the current screen of the Windows host to an image and return it as
 * base64. Captures the full virtual desktop across all monitors.
 *
 * The image is written to a server-owned directory (`options.dir`, chosen by the
 * operator via config). Callers never control the destination path, so this tool
 * cannot be used to write arbitrary files on the host. Successful captures are
 * kept on disk so an operator can review them, then pruned by the retention
 * sweep (`options.retentionMs`); a failed capture's partial file is removed
 * immediately.
 *
 * Screen capture requires an active, interactive desktop session. When
 * WinBridge runs in a non-interactive service context (session 0) the capture
 * fails; the returned result carries `success: false` and the PowerShell error.
 */
export async function captureScreenshot(
  runtime: PowerShellRuntimeOptions,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const commandId = randomUUID();
  const format: ScreenshotFormat = options.format && FORMAT_META[options.format] ? options.format : "png";
  const meta = FORMAT_META[format];
  const dir = options.dir ?? defaultScreenshotDir();

  // Prune old captures before writing a new one so the directory stays bounded
  // even on a busy server that never restarts.
  if (options.retentionMs !== undefined) {
    sweepOldScreenshots(dir, options.retentionMs);
  }

  const outputPath = join(dir, `${SCREENSHOT_PREFIX}${commandId}.${meta.extension}`);

  const failure = (error: string, durationMs: number): ScreenshotResult => {
    removeIfPresent(outputPath);
    return {
      commandId,
      success: false,
      format,
      mimeType: meta.mimeType,
      width: null,
      height: null,
      bytes: 0,
      base64: "",
      durationMs,
      error
    };
  };

  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error), 0);
  }

  const result = await executePowerShell(runtime, {
    command: buildScreenshotCommand(outputPath, format),
    timeoutMs: options.timeoutMs
  });

  if (result.exitCode !== 0 || !existsSync(outputPath)) {
    return failure(
      result.stderr.trim() || `Screen capture failed with exit code ${result.exitCode}.`,
      result.durationMs
    );
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(outputPath);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error), result.durationMs);
  }

  const { width, height } = parseDimensions(result.stdout);

  return {
    commandId,
    success: true,
    format,
    mimeType: meta.mimeType,
    width,
    height,
    bytes: buffer.length,
    base64: buffer.toString("base64"),
    path: outputPath,
    durationMs: result.durationMs
  };
}
