import { describe, expect, it } from "vitest";
import { executeBash, resolveBashPath, toBashRuntime } from "../src/bash/shell.js";
import { BashSessionManager } from "../src/bash/session.js";
import type { BashRuntimeOptions } from "../src/bash/types.js";

const runtime: BashRuntimeOptions = {
  defaultCwd: process.cwd(),
  defaultTimeoutMs: 8000,
  maxOutputBytes: 1024 * 1024
};

/**
 * Git Bash may not be installed on the machine running these tests. The CI
 * runner is Windows and usually ships Git Bash, but tests skip gracefully when
 * bash cannot be resolved so the suite stays green everywhere.
 */
function hasBash(): boolean {
  return resolveBashPath(runtime.bashPath) !== undefined;
}

describe("resolveBashPath", () => {
  it("honors an explicit configured path verbatim", () => {
    expect(resolveBashPath("D:/custom/bash.exe")).toBe("D:/custom/bash.exe");
  });

  it("returns a path or undefined for auto-detection", () => {
    const resolved = resolveBashPath();
    // Non-Windows falls back to `bash` on PATH; Windows returns a probed path or
    // undefined when Git Bash is absent.
    if (process.platform !== "win32") {
      expect(resolved).toBe("bash");
    } else {
      expect(resolved === undefined || resolved.toLowerCase().endsWith("bash.exe")).toBe(true);
    }
  });
});

describe("toBashRuntime", () => {
  it("maps the app-config fields onto the bash runtime", () => {
    const rt = toBashRuntime({
      bash: { path: "C:/git/bash.exe" },
      defaultCwd: "/work",
      defaultTimeoutMs: 1234,
      maxOutputBytes: 42
    });
    expect(rt).toEqual({
      bashPath: "C:/git/bash.exe",
      defaultCwd: "/work",
      defaultTimeoutMs: 1234,
      maxOutputBytes: 42
    });
  });
});

describe("Bash execution", () => {
  it("runs a one-shot command", async () => {
    if (!hasBash()) {
      return;
    }

    const result = await executeBash(runtime, { command: "echo hello" });
    expect(result.stdout).toContain("hello");
    expect(result.exitCode).toBe(0);
  });

  it("captures a non-zero exit code", async () => {
    if (!hasBash()) {
      return;
    }

    const result = await executeBash(runtime, { command: "echo oops >&2; exit 7" });
    expect(result.stderr).toContain("oops");
    expect(result.exitCode).toBe(7);
  });

  it("times out long-running commands", async () => {
    if (!hasBash()) {
      return;
    }

    const result = await executeBash(runtime, { command: "sleep 5", timeoutMs: 500 });
    expect(result.exitCode).toBeNull();
    expect(result.stderr).toContain("timed out");
  });

  it("truncates large output", async () => {
    if (!hasBash()) {
      return;
    }

    const result = await executeBash(runtime, {
      command: "for i in $(seq 1 50); do echo abcdef; done",
      maxOutputBytes: 20
    });
    expect(result.stdout.length).toBeLessThanOrEqual(20);
    expect(result.truncated).toBe(true);
  });
});

describe("Bash sessions", () => {
  it("preserves state across commands", async () => {
    if (!hasBash()) {
      return;
    }

    const manager = new BashSessionManager(runtime);
    const session = manager.open();

    try {
      await manager.send(session.sessionId, { command: "WINREACH_VALUE=persisted" });
      const result = await manager.send(session.sessionId, { command: "echo $WINREACH_VALUE" });
      expect(result.stdout).toContain("persisted");
      expect(result.exitCode).toBe(0);
    } finally {
      expect(manager.close(session.sessionId)).toBe(true);
    }
  });

  it("reports the exit code of a session command", async () => {
    if (!hasBash()) {
      return;
    }

    const manager = new BashSessionManager(runtime);
    const session = manager.open();

    try {
      const result = await manager.send(session.sessionId, { command: "false" });
      expect(result.exitCode).toBe(1);
    } finally {
      manager.close(session.sessionId);
    }
  });

  it("tracks and removes sessions without needing a live shell", () => {
    if (!hasBash()) {
      return;
    }

    const manager = new BashSessionManager(runtime);
    const session = manager.open();
    expect(manager.list()).toHaveLength(1);
    expect(manager.close(session.sessionId)).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });
});
