import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, shortestTokenLength } from "../src/config.js";

// loadConfig only records TLS paths; it never reads the files, so these can be
// arbitrary path strings.
const CERT = "C:/certs/server-cert.pem";
const KEY = "C:/certs/server-key.pem";
const CLIENT_CA = "C:/certs/client-ca-cert.pem";
let snapshot: Record<string, string | undefined>;

/** Remove every WINREACH_ prefixed var so each test starts clean. */
function clearWinReachEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WINREACH_")) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  snapshot = { ...process.env };
  clearWinReachEnv();
});

afterEach(() => {
  clearWinReachEnv();
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined && key.startsWith("WINREACH_")) {
      process.env[key] = value;
    }
  }
});

describe("loadConfig authentication", () => {
  it("throws when neither token nor principals is set", () => {
    expect(() => loadConfig()).toThrow(/WINREACH_TOKEN or WINREACH_PRINCIPALS/);
  });

  it("creates a single admin principal from WINREACH_TOKEN", () => {
    process.env.WINREACH_TOKEN = "single-token";
    const config = loadConfig();
    expect(config.principals).toHaveLength(1);
    expect(config.principals[0].name).toBe("default");
    expect(config.principals[0].role).toBe("admin");
  });

  it("merges WINREACH_TOKEN with WINREACH_PRINCIPALS", () => {
    process.env.WINREACH_TOKEN = "admin-token";
    process.env.WINREACH_PRINCIPALS = JSON.stringify([{ name: "alice", token: "alice-token", deny: ["Remove-Item"] }]);
    const config = loadConfig();
    expect(config.principals.map((p) => p.name)).toEqual(["default", "alice"]);
  });

  it("rejects a principal token that duplicates the primary token", () => {
    process.env.WINREACH_TOKEN = "dup";
    process.env.WINREACH_PRINCIPALS = JSON.stringify([{ name: "alice", token: "dup" }]);
    expect(() => loadConfig()).toThrow(/Duplicate principal credential/);
  });
});

describe("loadConfig command policy", () => {
  it("parses comma-separated allow/deny lists", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_COMMAND_DENYLIST = "Remove-Item,Format-Volume";
    const config = loadConfig();
    expect(config.globalPolicy.deny).toHaveLength(2);
    expect(config.globalPolicy.deny[0].test("remove-item x")).toBe(true);
  });

  it("parses a JSON array so patterns may contain commas", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_COMMAND_DENYLIST = JSON.stringify(["\\d{1,3}\\.\\d{1,3}"]);
    const config = loadConfig();
    expect(config.globalPolicy.deny).toHaveLength(1);
    expect(config.globalPolicy.deny[0].test("10.20")).toBe(true);
  });
});

describe("loadConfig TLS", () => {
  it("is undefined by default", () => {
    process.env.WINREACH_TOKEN = "t";
    expect(loadConfig().tls).toBeUndefined();
  });

  it("builds a TLS config from cert + key", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TLS_CERT = CERT;
    process.env.WINREACH_TLS_KEY = KEY;
    const config = loadConfig();
    expect(config.tls?.certPath).toContain("server-cert.pem");
    expect(config.tls?.clientCaPath).toBeUndefined();
  });

  it("throws when only one of cert/key is set", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TLS_CERT = CERT;
    expect(() => loadConfig()).toThrow(/Both WINREACH_TLS_CERT and WINREACH_TLS_KEY/);
  });

  it("throws when a client CA is set without TLS", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TLS_CLIENT_CA = CLIENT_CA;
    expect(() => loadConfig()).toThrow(/mTLS needs TLS/);
  });

  it("enables mTLS when cert, key, and client CA are all set", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TLS_CERT = CERT;
    process.env.WINREACH_TLS_KEY = KEY;
    process.env.WINREACH_TLS_CLIENT_CA = CLIENT_CA;
    expect(loadConfig().tls?.clientCaPath).toContain("client-ca-cert.pem");
  });
});

describe("loadConfig tunnel", () => {
  it("defaults to a disabled quick tunnel with no tunnel env vars", () => {
    process.env.WINREACH_TOKEN = "t";
    const { tunnel } = loadConfig();
    expect(tunnel.enabled).toBe(false);
    expect(tunnel.provider).toBe("cloudflare");
    expect(tunnel.token).toBeUndefined();
    expect(tunnel.hostname).toBeUndefined();
    expect(tunnel.autoInstall).toBe(true);
  });

  it("enables a quick tunnel from WINREACH_TUNNEL=cloudflare (no named credentials)", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TUNNEL = "cloudflare";
    const { tunnel } = loadConfig();
    expect(tunnel.enabled).toBe(true);
    expect(tunnel.token).toBeUndefined();
    expect(tunnel.hostname).toBeUndefined();
  });

  it("infers named mode from a token + hostname and enables the tunnel", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TUNNEL_TOKEN = "cf-tunnel-token";
    process.env.WINREACH_TUNNEL_HOSTNAME = "winreach.example.com";
    const { tunnel } = loadConfig();
    expect(tunnel.enabled).toBe(true);
    expect(tunnel.token).toBe("cf-tunnel-token");
    expect(tunnel.hostname).toBe("winreach.example.com");
  });

  it("throws when a token is supplied without a hostname", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TUNNEL_TOKEN = "cf-tunnel-token";
    expect(() => loadConfig()).toThrow(/WINREACH_TUNNEL_TOKEN and WINREACH_TUNNEL_HOSTNAME/);
  });

  it("throws when a hostname is supplied without a token", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_TUNNEL_HOSTNAME = "winreach.example.com";
    expect(() => loadConfig()).toThrow(/WINREACH_TUNNEL_TOKEN and WINREACH_TUNNEL_HOSTNAME/);
  });

  it("reads an explicit cloudflared path and autoinstall toggle", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_CLOUDFLARED_PATH = "C:/tools/cloudflared.exe";
    process.env.WINREACH_TUNNEL_AUTOINSTALL = "0";
    const { tunnel } = loadConfig();
    expect(tunnel.binaryPath).toBe("C:/tools/cloudflared.exe");
    expect(tunnel.autoInstall).toBe(false);
  });
});

describe("loadConfig audit + helpers", () => {
  it("reads the audit log path", () => {
    process.env.WINREACH_TOKEN = "t";
    process.env.WINREACH_AUDIT_LOG = "C:/logs/winreach.jsonl";
    expect(loadConfig().auditLogPath).toBe("C:/logs/winreach.jsonl");
  });

  it("shortestTokenLength returns the minimum across principals", () => {
    process.env.WINREACH_TOKEN = "0123456789";
    process.env.WINREACH_PRINCIPALS = JSON.stringify([{ name: "alice", token: "short" }]);
    expect(shortestTokenLength(loadConfig().principals)).toBe(5);
  });
});
