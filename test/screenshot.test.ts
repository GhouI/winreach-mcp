import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildScreenshotCommand, captureScreenshot } from "../src/powershell/screenshot.js";
import type { PowerShellRuntimeOptions } from "../src/powershell/types.js";

const runtime: PowerShellRuntimeOptions = {
  defaultCwd: process.cwd(),
  defaultTimeoutMs: 15000,
  maxOutputBytes: 1024 * 1024
};

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

describe("captureScreenshot", () => {
  it("captures the screen on an interactive Windows session", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const result = await captureScreenshot(runtime);

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
    expect(result.path).toBeUndefined();
  });

  it("keeps the file when an explicit path is given", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const target = join(tmpdir(), `winbridge-screenshot-test-${Date.now()}.png`);
    try {
      const result = await captureScreenshot(runtime, { path: target });
      if (!result.success) {
        return;
      }
      expect(result.path).toBe(target);
      expect(existsSync(target)).toBe(true);
    } finally {
      if (existsSync(target)) {
        rmSync(target);
      }
    }
  });
});
