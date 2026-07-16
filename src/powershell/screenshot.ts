import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
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

/**
 * Capture the current screen of the Windows host to an image and return it as
 * base64. Captures the full virtual desktop across all monitors.
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
  const format: ScreenshotFormat = options.format ?? "png";
  const meta = FORMAT_META[format];
  const keepFile = Boolean(options.path);
  const outputPath =
    options.path ?? join(tmpdir(), `winbridge-screenshot-${commandId}.${meta.extension}`);

  const result = await executePowerShell(runtime, {
    command: buildScreenshotCommand(outputPath, format),
    timeoutMs: options.timeoutMs
  });

  const failure = (error: string): ScreenshotResult => ({
    commandId,
    success: false,
    format,
    mimeType: meta.mimeType,
    width: null,
    height: null,
    bytes: 0,
    base64: "",
    durationMs: result.durationMs,
    error
  });

  if (result.exitCode !== 0 || !existsSync(outputPath)) {
    return failure(result.stderr.trim() || `Screen capture failed with exit code ${result.exitCode}.`);
  }

  let buffer: Buffer;
  try {
    buffer = readFileSync(outputPath);
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    if (!keepFile && existsSync(outputPath)) {
      try {
        rmSync(outputPath);
      } catch {
        // Best-effort cleanup of the temp file; ignore failures.
      }
    }
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
    path: keepFile ? outputPath : undefined,
    durationMs: result.durationMs
  };
}
