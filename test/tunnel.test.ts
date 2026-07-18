import { describe, expect, it } from "vitest";
import {
  buildMcpUrl,
  cloudflaredAssetName,
  namedTunnelArgs,
  namedTunnelPublicUrl,
  parseNamedTunnelReady,
  parseQuickTunnelUrl,
  quickTunnelArgs
} from "../src/tunnel.js";

describe("parseQuickTunnelUrl", () => {
  it("extracts a trycloudflare url from cloudflared output", () => {
    const line =
      "2024-01-01T00:00:00Z INF +-----+\n" +
      "Your quick Tunnel has been created! Visit it at:\n" +
      "https://random-words-here.trycloudflare.com\n";
    expect(parseQuickTunnelUrl(line)).toBe("https://random-words-here.trycloudflare.com");
  });

  it("returns undefined when no url is present", () => {
    expect(parseQuickTunnelUrl("starting metrics server")).toBeUndefined();
  });
});

describe("parseNamedTunnelReady", () => {
  it("detects a registered tunnel connection line", () => {
    const line =
      "2026-07-18T00:00:00Z INF Registered tunnel connection connIndex=0 " +
      'connection=abc123 event=0 ip=198.51.100.1 location=lax07 protocol=quic';
    expect(parseNamedTunnelReady(line)).toBe(true);
  });

  it("detects the alternate 'Connection <id> registered' phrasing", () => {
    expect(parseNamedTunnelReady("INF Connection 0a1b2c3d-4e5f registered connIndex=1")).toBe(true);
  });

  it("returns false before any connection registers", () => {
    expect(parseNamedTunnelReady("INF Starting tunnel tunnelID=deadbeef")).toBe(false);
  });

  it("does not treat a quick-tunnel URL as ready", () => {
    expect(parseNamedTunnelReady("https://random-words.trycloudflare.com")).toBe(false);
  });
});

describe("namedTunnelPublicUrl", () => {
  it("prefixes a bare hostname with https", () => {
    expect(namedTunnelPublicUrl("winreach.example.com")).toBe("https://winreach.example.com");
  });

  it("strips an existing scheme and trailing slashes", () => {
    expect(namedTunnelPublicUrl("https://winreach.example.com/")).toBe("https://winreach.example.com");
    expect(namedTunnelPublicUrl("http://winreach.example.com")).toBe("https://winreach.example.com");
  });

  it("trims surrounding whitespace", () => {
    expect(namedTunnelPublicUrl("  winreach.example.com  ")).toBe("https://winreach.example.com");
  });
});

describe("buildMcpUrl", () => {
  it("joins origin and endpoint path", () => {
    expect(buildMcpUrl("https://abc.trycloudflare.com", "/mcp")).toBe("https://abc.trycloudflare.com/mcp");
  });

  it("normalizes trailing and missing slashes", () => {
    expect(buildMcpUrl("https://abc.trycloudflare.com/", "mcp")).toBe("https://abc.trycloudflare.com/mcp");
  });

  it("builds a stable MCP url from a named hostname", () => {
    expect(buildMcpUrl(namedTunnelPublicUrl("winreach.example.com"), "/mcp")).toBe(
      "https://winreach.example.com/mcp"
    );
  });
});

describe("cloudflared argument construction", () => {
  it("builds quick-tunnel args with the host-header rewrite and --url", () => {
    expect(quickTunnelArgs("http://127.0.0.1:7573")).toEqual([
      "tunnel",
      "--no-autoupdate",
      "--http-host-header",
      "127.0.0.1",
      "--url",
      "http://127.0.0.1:7573"
    ]);
  });

  it("builds named-tunnel args with `run --token` and no --url", () => {
    const args = namedTunnelArgs("tok-secret-123");
    expect(args).toEqual([
      "tunnel",
      "--no-autoupdate",
      "--http-host-header",
      "127.0.0.1",
      "run",
      "--token",
      "tok-secret-123"
    ]);
    // Named mode has ingress managed in Cloudflare, so it never scrapes a URL.
    expect(args).not.toContain("--url");
    // The host-header rewrite is preserved so DNS-rebinding validation passes.
    expect(args).toContain("--http-host-header");
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
