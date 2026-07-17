import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuditLogger, type AuditEntry } from "../src/audit.js";

const tempDirs: string[] = [];

function tempFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "winreach-audit-"));
  tempDirs.push(dir);
  return join(dir, name);
}

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const baseEntry: AuditEntry = {
  time: "2026-07-03T00:00:00.000Z",
  principal: "alice",
  role: "readonly",
  tool: "powershell_execute",
  decision: "allowed",
  command: "Get-Process",
  exitCode: 0,
  durationMs: 12
};

describe("audit logger", () => {
  it("no-op logger writes nothing and does not throw", async () => {
    const logger = createAuditLogger(undefined);
    await expect(logger.log(baseEntry)).resolves.toBeUndefined();
  });

  it("writes one JSON object per line", async () => {
    const file = tempFile("audit.log");
    const logger = createAuditLogger(file);
    await logger.log(baseEntry);
    await logger.log({ ...baseEntry, decision: "blocked", reason: "denylist" });

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as AuditEntry;
    expect(first.principal).toBe("alice");
    expect(first.decision).toBe("allowed");

    const second = JSON.parse(lines[1]) as AuditEntry;
    expect(second.decision).toBe("blocked");
    expect(second.reason).toBe("denylist");
  });

  it("creates the parent directory when missing", async () => {
    const file = tempFile(join("nested", "deep", "audit.log"));
    const logger = createAuditLogger(file);
    await logger.log(baseEntry);
    expect(readFileSync(file, "utf8")).toContain("\"principal\":\"alice\"");
  });

  it("serializes concurrent writes without interleaving", async () => {
    const file = tempFile("audit.log");
    const logger = createAuditLogger(file);
    await Promise.all(
      Array.from({ length: 25 }, (_unused, i) =>
        logger.log({ ...baseEntry, command: `cmd-${i}`, durationMs: i })
      )
    );

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(25);
    // Every line must be valid JSON (no partial/interleaved writes).
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
