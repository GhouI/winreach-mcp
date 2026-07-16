import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildScreenshotCommand,
  captureScreenshot,
  sweepOldScreenshots
} from "../src/powershell/screenshot.js";
import type { PowerShellRuntimeOptions } from "../src/powershell/types.js";

const runtime: PowerShellRuntimeOptions = {
  defaultCwd: process.cwd(),
  defaultTimeoutMs: 15000,
  maxOutputBytes: 1024 * 1024
};

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "winbridge-shot-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("buildScreenshotCommand", () => {
  it("embeds the output path and PNG format", () => {
    const command = buildScreenshotCommand("C:\\temp\\shot.png", "png");
    expect(command).toContain("'C:\\temp\\shot.png'");
    expect(command).toContain("ImageFormat]::Png");
    expect(command).toContain("VirtualScreen");
  });

  it("uses the JPEG image format for jpeg", () => {
    const command = buildScreenshotCommand("C:\\temp\\shot.jpg", "jpeg");
    expect(command).toContain("ImageFormat]::Jpeg");
  });

  it("escapes single quotes in the output path", () => {
    const command = buildScreenshotCommand("C:\\o'brien\\shot.png", "png");
    expect(command).toContain("'C:\\o''brien\\shot.png'");
  });
});

describe("sweepOldScreenshots", () => {
  it("deletes captures older than the retention window and keeps fresh ones", () => {
    const dir = makeTempDir();
    const oldFile = join(dir, "winbridge-screenshot-old.png");
    const freshFile = join(dir, "winbridge-screenshot-fresh.png");
    writeFileSync(oldFile, "old");
    writeFileSync(freshFile, "fresh");

    // Backdate the old capture two hours.
    const twoHoursAgo = Date.now() / 1000 - 2 * 60 * 60;
    utimesSync(oldFile, twoHoursAgo, twoHoursAgo);

    const removed = sweepOldScreenshots(dir, 60 * 60 * 1000); // 1h retention

    expect(removed).toBe(1);
    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(freshFile)).toBe(true);
  });

  it("ignores files that are not WinBridge captures", () => {
    const dir = makeTempDir();
    const unrelated = join(dir, "important.txt");
    writeFileSync(unrelated, "keep me");
    const longAgo = Date.now() / 1000 - 999 * 60 * 60;
    utimesSync(unrelated, longAgo, longAgo);

    const removed = sweepOldScreenshots(dir, 1);

    expect(removed).toBe(0);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("is a no-op for a missing directory or non-positive retention", () => {
    expect(sweepOldScreenshots(join(tmpdir(), "winbridge-does-not-exist-xyz"), 1000)).toBe(0);
    const dir = makeTempDir();
    writeFileSync(join(dir, "winbridge-screenshot-a.png"), "a");
    expect(sweepOldScreenshots(dir, 0)).toBe(0);
  });
});

describe("captureScreenshot", () => {
  it("captures the screen on an interactive Windows session", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const dir = makeTempDir();
    const result = await captureScreenshot(runtime, { dir, retentionMs: 60 * 60 * 1000 });

    // A headless/service session cannot capture a desktop; only assert the
    // full success contract when the capture actually succeeded.
    if (!result.success) {
      expect(result.error).toBeTruthy();
      expect(result.base64).toBe("");
      return;
    }

    expect(result.mimeType).toBe("image/png");
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    // The capture is kept on disk (in the server-owned dir) for the retention window.
    expect(result.path).toBeTruthy();
    expect(existsSync(result.path!)).toBe(true);
  });
});
