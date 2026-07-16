import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, shortestTokenLength } from "../src/config.js";

// loadConfig only records TLS paths; it never reads the files, so these can be
// arbitrary path strings.
const CERT = "C:/certs/server-cert.pem";
const KEY = "C:/certs/server-key.pem";
const CLIENT_CA = "C:/certs/client-ca-cert.pem";
let snapshot: Record<string, string | undefined>;

/** Remove every WINBRIDGE_ and PENDRAGON_ prefixed var so each test starts clean. */
function clearWinbridgeEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WINBRIDGE_") || key.startsWith("PENDRAGON_")) {
      delete process.env[key];
    }
  }
}

beforeEach(() => {
  snapshot = { ...process.env };
  clearWinbridgeEnv();
});

afterEach(() => {
  clearWinbridgeEnv();
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined && (key.startsWith("WINBRIDGE_") || key.startsWith("PENDRAGON_"))) {
      process.env[key] = value;
    }
  }
});

describe("loadConfig authentication", () => {
  it("throws when neither token nor principals is set", () => {
    expect(() => loadConfig()).toThrow(/WINBRIDGE_TOKEN or WINBRIDGE_PRINCIPALS/);
  });

  it("creates a single admin principal from WINBRIDGE_TOKEN", () => {
    process.env.WINBRIDGE_TOKEN = "single-token";
    const config = loadConfig();
    expect(config.principals).toHaveLength(1);
    expect(config.principals[0].name).toBe("default");
    expect(config.principals[0].role).toBe("admin");
  });

  it("accepts the legacy PENDRAGON_TOKEN alias", () => {
    process.env.PENDRAGON_TOKEN = "legacy-token";
    expect(loadConfig().principals[0].token).toBe("legacy-token");
  });

  it("merges WINBRIDGE_TOKEN with WINBRIDGE_PRINCIPALS", () => {
    process.env.WINBRIDGE_TOKEN = "admin-token";
    process.env.WINBRIDGE_PRINCIPALS = JSON.stringify([{ name: "alice", token: "alice-token", deny: ["Remove-Item"] }]);
    const config = loadConfig();
    expect(config.principals.map((p) => p.name)).toEqual(["default", "alice"]);
  });

  it("rejects a principal token that duplicates the primary token", () => {
    process.env.WINBRIDGE_TOKEN = "dup";
    process.env.WINBRIDGE_PRINCIPALS = JSON.stringify([{ name: "alice", token: "dup" }]);
    expect(() => loadConfig()).toThrow(/Duplicate principal token/);
  });
});

describe("loadConfig command policy", () => {
  it("parses comma-separated allow/deny lists", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_COMMAND_DENYLIST = "Remove-Item,Format-Volume";
    const config = loadConfig();
    expect(config.globalPolicy.deny).toHaveLength(2);
    expect(config.globalPolicy.deny[0].test("remove-item x")).toBe(true);
  });

  it("parses a JSON array so patterns may contain commas", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_COMMAND_DENYLIST = JSON.stringify(["\\d{1,3}\\.\\d{1,3}"]);
    const config = loadConfig();
    expect(config.globalPolicy.deny).toHaveLength(1);
    expect(config.globalPolicy.deny[0].test("10.20")).toBe(true);
  });
});

describe("loadConfig TLS", () => {
  it("is undefined by default", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    expect(loadConfig().tls).toBeUndefined();
  });

  it("builds a TLS config from cert + key", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_TLS_CERT = CERT;
    process.env.WINBRIDGE_TLS_KEY = KEY;
    const config = loadConfig();
    expect(config.tls?.certPath).toContain("server-cert.pem");
    expect(config.tls?.clientCaPath).toBeUndefined();
  });

  it("throws when only one of cert/key is set", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_TLS_CERT = CERT;
    expect(() => loadConfig()).toThrow(/Both WINBRIDGE_TLS_CERT and WINBRIDGE_TLS_KEY/);
  });

  it("throws when a client CA is set without TLS", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_TLS_CLIENT_CA = CLIENT_CA;
    expect(() => loadConfig()).toThrow(/mTLS needs TLS/);
  });

  it("enables mTLS when cert, key, and client CA are all set", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_TLS_CERT = CERT;
    process.env.WINBRIDGE_TLS_KEY = KEY;
    process.env.WINBRIDGE_TLS_CLIENT_CA = CLIENT_CA;
    expect(loadConfig().tls?.clientCaPath).toContain("client-ca-cert.pem");
  });
});

describe("loadConfig audit + helpers", () => {
  it("reads the audit log path", () => {
    process.env.WINBRIDGE_TOKEN = "t";
    process.env.WINBRIDGE_AUDIT_LOG = "C:/logs/winbridge.jsonl";
    expect(loadConfig().auditLogPath).toBe("C:/logs/winbridge.jsonl");
  });

  it("shortestTokenLength returns the minimum across principals", () => {
    process.env.WINBRIDGE_TOKEN = "0123456789";
    process.env.WINBRIDGE_PRINCIPALS = JSON.stringify([{ name: "alice", token: "short" }]);
    expect(shortestTokenLength(loadConfig().principals)).toBe(5);
  });
});
