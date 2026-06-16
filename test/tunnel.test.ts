import { describe, expect, it } from "vitest";
import { buildMcpUrl, cloudflaredAssetName, parseQuickTunnelUrl } from "../src/tunnel.js";

describe("parseQuickTunnelUrl", () => {
  it("extracts a trycloudflare url from cloudflared output", () => {
    const line =
      "2024-01-01T00:00:00Z INF +-----+\n" +
      "Your quick Tunnel has been created! Visit it at:\n" +
      "https://random-words-here.trycloudflare.com\n";
    expect(parseQuickTunnelUrl(line)).toBe("https://random-words-here.trycloudflare.com");
  });

  it("returns undefined when no url is present", () => {
    expect(parseQuickTunnelUrl("registered tunnel connection")).toBeUndefined();
  });
});

describe("buildMcpUrl", () => {
  it("joins origin and endpoint path", () => {
    expect(buildMcpUrl("https://abc.trycloudflare.com", "/mcp")).toBe("https://abc.trycloudflare.com/mcp");
  });

  it("normalizes trailing and missing slashes", () => {
    expect(buildMcpUrl("https://abc.trycloudflare.com/", "mcp")).toBe("https://abc.trycloudflare.com/mcp");
  });
});

describe("cloudflaredAssetName", () => {
  it("maps windows architectures", () => {
    expect(cloudflaredAssetName("win32", "x64")).toBe("cloudflared-windows-amd64.exe");
    expect(cloudflaredAssetName("win32", "arm64")).toBe("cloudflared-windows-arm64.exe");
  });

  it("maps linux architectures", () => {
    expect(cloudflaredAssetName("linux", "x64")).toBe("cloudflared-linux-amd64");
    expect(cloudflaredAssetName("linux", "arm64")).toBe("cloudflared-linux-arm64");
  });

  it("throws on unsupported platforms", () => {
    expect(() => cloudflaredAssetName("darwin", "arm64")).toThrow(/not supported/);
  });
});
