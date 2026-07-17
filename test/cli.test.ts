import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.js";
import { generateToken } from "../src/token.js";

describe("parseCliArgs", () => {
  it("defaults to start with no args", () => {
    expect(parseCliArgs([])).toEqual({ kind: "start", tunnel: false });
  });

  it("treats an explicit `start` as start", () => {
    expect(parseCliArgs(["start"])).toEqual({ kind: "start", tunnel: false });
  });

  it("forwards --tunnel on start", () => {
    expect(parseCliArgs(["start", "--tunnel"])).toEqual({ kind: "start", tunnel: true });
    expect(parseCliArgs(["--tunnel"])).toEqual({ kind: "start", tunnel: true });
  });

  it("selects stdio via flag or subcommand", () => {
    expect(parseCliArgs(["--stdio"])).toEqual({ kind: "stdio" });
    expect(parseCliArgs(["stdio"])).toEqual({ kind: "stdio" });
  });

  it("selects gen-token", () => {
    expect(parseCliArgs(["gen-token"])).toEqual({ kind: "gen-token" });
  });

  it("selects help and version", () => {
    expect(parseCliArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["-h"])).toEqual({ kind: "help" });
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it("prioritizes help over other flags", () => {
    expect(parseCliArgs(["stdio", "--help"])).toEqual({ kind: "help" });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseCliArgs([" gen-token "])).toEqual({ kind: "gen-token" });
  });
});

describe("generateToken", () => {
  it("returns a url-safe base64 token of the expected length", () => {
    const token = generateToken();
    // 32 bytes -> 43 base64url chars (no padding).
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is long enough to clear the weak-token threshold", () => {
    expect(generateToken().length).toBeGreaterThanOrEqual(24);
  });

  it("produces a distinct token each call", () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it("honors a custom byte length", () => {
    // 16 bytes -> 22 base64url chars.
    expect(generateToken(16)).toHaveLength(22);
  });
});
