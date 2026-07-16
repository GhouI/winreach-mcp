import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  downloadFile,
  resolveWithinRoot,
  uploadFile,
  type FileTransferRuntime
} from "../src/fileTransfer.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length) {
    rmSync(roots.pop()!, { recursive: true, force: true });
  }
});

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "winbridge-files-"));
  roots.push(dir);
  return dir;
}

function runtime(root: string, maxBytes = 50 * 1024 * 1024): FileTransferRuntime {
  return { root, maxBytes };
}

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

describe("resolveWithinRoot", () => {
  it("resolves a relative path inside the root", () => {
    const root = makeRoot();
    const { absolute, relative } = resolveWithinRoot(root, "sub/file.txt", false);
    expect(absolute).toBe(join(root, "sub", "file.txt"));
    expect(relative.replace(/\\/g, "/")).toBe("sub/file.txt");
  });

  it("rejects absolute paths", () => {
    const root = makeRoot();
    expect(() => resolveWithinRoot(root, join(root, "x.txt"), false)).toThrow(/relative/i);
  });

  it("rejects parent-directory traversal", () => {
    const root = makeRoot();
    expect(() => resolveWithinRoot(root, "../escape.txt", false)).toThrow(/escapes/i);
    expect(() => resolveWithinRoot(root, "a/../../escape.txt", false)).toThrow(/escapes/i);
  });

  it("rejects an empty path", () => {
    const root = makeRoot();
    expect(() => resolveWithinRoot(root, "   ", false)).toThrow(/required/i);
  });

  it("rejects Windows absolute and drive-relative escapes", () => {
    if (process.platform !== "win32") {
      return;
    }
    const root = makeRoot();
    for (const bad of ["C:\\Windows\\System32", "\\\\server\\share\\x", "\\\\?\\C:\\x", "\\\\.\\C:\\x"]) {
      expect(() => resolveWithinRoot(root, bad, false)).toThrow();
    }
    // Cross-drive drive-relative (e.g. "D:evil") resolves off-root and must be rejected.
    const otherDrive = root.toUpperCase().startsWith("C:") ? "D:evil" : "C:evil";
    expect(() => resolveWithinRoot(root, otherDrive, false)).toThrow(/escapes|relative/i);
  });

  it("rejects a symlink that escapes the root", () => {
    const root = makeRoot();
    const outside = makeRoot();
    let linked = false;
    try {
      symlinkSync(outside, join(root, "link"), "dir");
      linked = true;
    } catch {
      // Symlink creation may require privileges on Windows; skip if unavailable.
      return;
    }
    if (linked) {
      expect(() => resolveWithinRoot(root, "link/secret.txt", false)).toThrow(/symlink/i);
    }
  });
});

describe("uploadFile", () => {
  it("writes a file and reports its hash and size", () => {
    const root = makeRoot();
    const result = uploadFile(runtime(root), { path: "hello.txt", content: b64("hello world") });
    expect(result.success).toBe(true);
    expect(result.bytes).toBe(11);
    expect(result.relativePath?.replace(/\\/g, "/")).toBe("hello.txt");
    expect(readFileSync(join(root, "hello.txt"), "utf8")).toBe("hello world");
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("creates nested parent directories inside the root", () => {
    const root = makeRoot();
    const result = uploadFile(runtime(root), { path: "a/b/c.txt", content: b64("nested") });
    expect(result.success).toBe(true);
    expect(existsSync(join(root, "a", "b", "c.txt"))).toBe(true);
  });

  it("refuses to overwrite unless overwrite is set", () => {
    const root = makeRoot();
    uploadFile(runtime(root), { path: "x.txt", content: b64("first") });
    const blocked = uploadFile(runtime(root), { path: "x.txt", content: b64("second") });
    expect(blocked.success).toBe(false);
    expect(blocked.error).toMatch(/exists/i);

    const forced = uploadFile(runtime(root), { path: "x.txt", content: b64("second"), overwrite: true });
    expect(forced.success).toBe(true);
    expect(forced.overwritten).toBe(true);
    expect(readFileSync(join(root, "x.txt"), "utf8")).toBe("second");
  });

  it("enforces the size cap", () => {
    const root = makeRoot();
    const result = uploadFile(runtime(root, 4), { path: "big.txt", content: b64("too many bytes") });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/limit/i);
    expect(existsSync(join(root, "big.txt"))).toBe(false);
  });

  it("rejects traversal paths", () => {
    const root = makeRoot();
    const result = uploadFile(runtime(root), { path: "../evil.txt", content: b64("x") });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes/i);
  });

  it("fails cleanly when no root is configured", () => {
    const result = uploadFile({ root: undefined, maxBytes: 1024 }, { path: "x.txt", content: b64("x") });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/disabled/i);
  });
});

describe("downloadFile", () => {
  it("reads a file and returns base64 content", () => {
    const root = makeRoot();
    writeFileSync(join(root, "note.txt"), "download me");
    const result = downloadFile(runtime(root), { path: "note.txt" });
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(false);
    expect(Buffer.from(result.base64!, "base64").toString("utf8")).toBe("download me");
    expect(existsSync(join(root, "note.txt"))).toBe(true);
  });

  it("deletes the source when deleteSource is set (move)", () => {
    const root = makeRoot();
    writeFileSync(join(root, "move.txt"), "moving");
    const result = downloadFile(runtime(root), { path: "move.txt", deleteSource: true });
    expect(result.success).toBe(true);
    expect(result.deleted).toBe(true);
    expect(existsSync(join(root, "move.txt"))).toBe(false);
  });

  it("fails for a missing file", () => {
    const root = makeRoot();
    const result = downloadFile(runtime(root), { path: "nope.txt" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("refuses to download a directory", () => {
    const root = makeRoot();
    mkdirSync(join(root, "sub"));
    const result = downloadFile(runtime(root), { path: "sub" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/directory/i);
  });

  it("enforces the size cap", () => {
    const root = makeRoot();
    writeFileSync(join(root, "big.bin"), Buffer.alloc(100));
    const result = downloadFile(runtime(root, 10), { path: "big.bin" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/limit/i);
    // A rejected download must not delete the source.
    expect(existsSync(join(root, "big.bin"))).toBe(true);
  });

  it("round-trips binary content byte-for-byte", () => {
    const root = makeRoot();
    const bytes = Buffer.from([0, 1, 2, 250, 251, 255, 10, 13]);
    const up = uploadFile(runtime(root), { path: "bin/data", content: bytes.toString("base64") });
    expect(up.success).toBe(true);
    const down = downloadFile(runtime(root), { path: "bin/data" });
    expect(down.success).toBe(true);
    expect(Buffer.from(down.base64!, "base64").equals(bytes)).toBe(true);
    expect(down.sha256).toBe(up.sha256);
  });
});
