import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { executePowerShell, resolveShellPath } from "../src/powershell/shell.js";
import { PowerShellSessionManager } from "../src/powershell/session.js";
import type { PowerShellRuntimeOptions } from "../src/powershell/types.js";

const runtime: PowerShellRuntimeOptions = {
  defaultCwd: process.cwd(),
  defaultTimeoutMs: 5000,
  maxOutputBytes: 1024 * 1024
};

function hasLocalPowerShell(): boolean {
  return process.platform === "win32" || resolveShellPath() === "pwsh";
}

describe("PowerShell execution", () => {
  it("runs a one-shot command", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const result = await executePowerShell(runtime, {
      command: "Write-Output \"hello\""
    });

    expect(result.stdout).toContain("hello");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("captures failing command output", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const result = await executePowerShell(runtime, {
      command: "Write-Error \"bad\"; exit 7"
    });

    expect(result.stderr).toContain("bad");
    expect(result.exitCode).toBe(7);
  });

  it("times out long-running commands", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const result = await executePowerShell(runtime, {
      command: "Start-Sleep -Seconds 5",
      timeoutMs: 500
    });

    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("timed out");
  });

  it("truncates large output", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const result = await executePowerShell(runtime, {
      command: "1..20 | ForEach-Object { Write-Output \"abcdef\" }",
      maxOutputBytes: 20
    });

    expect(result.stdout.length).toBeLessThanOrEqual(20);
    expect(result.truncated).toBe(true);
  });

  it("honors cwd", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const result = await executePowerShell(runtime, {
      command: "(Get-Location).Path",
      cwd: process.cwd()
    });

    expect(result.stdout.trim().toLowerCase()).toBe(process.cwd().toLowerCase());
  });
});

describe("PowerShell sessions", () => {
  it("preserves state across commands", async () => {
    if (!hasLocalPowerShell()) {
      return;
    }

    const manager = new PowerShellSessionManager(runtime);
    const session = manager.open();

    try {
      await manager.send(session.sessionId, {
        command: "$winbridgeValue = \"persisted\""
      });
      const result = await manager.send(session.sessionId, {
        command: "Write-Output $winbridgeValue"
      });

      expect(result.stdout).toContain("persisted");
      expect(result.exitCode).toBe(0);
    } finally {
      expect(manager.close(session.sessionId)).toBe(true);
    }
  });

  it("removes closed sessions", () => {
    const manager = new PowerShellSessionManager(runtime);
    const session = manager.open();
    expect(manager.list()).toHaveLength(1);
    expect(manager.close(session.sessionId)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });
});

describe("mock shell fixture", () => {
  it("supports deterministic stateless execution", async () => {
    const shellPath = join(process.cwd(), "test", "fixtures", "mock-shell.cmd");
    if (!existsSync(shellPath)) {
      return;
    }

    const result = await executePowerShell(
      { ...runtime, shellPath },
      { command: "mock_error" }
    );

    expect(result.stderr).toContain("mock error");
    expect(result.exitCode).toBe(7);
  });
});
