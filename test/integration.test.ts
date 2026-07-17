import { request as httpsRequest } from "node:https";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createAuditLogger } from "../src/audit.js";
import { compilePatterns } from "../src/policy.js";
import { createPrimaryPrincipal, parsePrincipals, type Principal } from "../src/principals.js";
import { createServerForApp, type TlsConfig } from "../src/tls.js";
import { createWinBridgeApp, createWinBridgeMcpServer } from "../src/mcpServer.js";
import { PowerShellSessionManager } from "../src/powershell/session.js";
import type { AppConfig } from "../src/config.js";
import { ensureTlsFixtures } from "./support/tls-fixtures.js";

const tlsFixtures = ensureTlsFixtures();
const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) {
    cleanups.pop()!();
  }
});

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    name: "winbridge-mcp",
    version: "0.0.0-test",
    host: "127.0.0.1",
    port: 0,
    endpointPath: "/mcp",
    principals: [createPrimaryPrincipal("admin-token", { allow: [], deny: [] })],
    globalPolicy: { allow: [], deny: compilePatterns(["Remove-Item", "Format-Volume"], "deny") },
    screenshot: { enabled: false, allowedRoles: [], dir: join(tmpdir(), "winbridge-shots-test"), retentionMs: 0 },
    fileTransfer: { enabled: false, maxBytes: 50 * 1024 * 1024 },
    allowedOrigins: [],
    defaultCwd: process.cwd(),
    defaultTimeoutMs: 5000,
    maxOutputBytes: 1024 * 1024,
    tunnel: { enabled: false, provider: "cloudflare", autoInstall: true },
    ...overrides
  };
}

async function listen(server: import("node:http").Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => server.close());
  return (server.address() as AddressInfo).port;
}

type HttpsResult = { statusCode: number; body: string };

/** Minimal HTTPS POST that supports client certs, for exercising mTLS. */
function httpsPost(
  port: number,
  options: { ca: Buffer; token?: string; cert?: Buffer; key?: Buffer }
): Promise<HttpsResult> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        ca: options.ca,
        cert: options.cert,
        key: options.key,
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
        }
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
  });
}

describe("HTTP bearer auth + guards", () => {
  it("rejects missing, wrong tokens, bad origins, and wrong methods", async () => {
    const { app } = createWinBridgeApp(makeConfig({ allowedOrigins: ["http://allowed.example"] }));
    const { server } = createServerForApp(app, undefined);
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}/mcp`;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });

    const noToken = await fetch(base, { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(noToken.status).toBe(401);

    const wrongToken = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      body
    });
    expect(wrongToken.status).toBe(401);

    const badOrigin = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer admin-token", origin: "http://evil.example" },
      body
    });
    expect(badOrigin.status).toBe(403);

    const getMethod = await fetch(base, { method: "GET", headers: { authorization: "Bearer admin-token" } });
    expect(getMethod.status).toBe(405);
  });

  it("rejects an oversized unauthenticated body with 401, not 413 (auth runs before body parsing)", async () => {
    // File transfer disabled here, so the JSON body limit is the 100 kB default.
    const { app } = createWinBridgeApp(makeConfig());
    const { server } = createServerForApp(app, undefined);
    const port = await listen(server);

    // A 200 kB body exceeds the 100 kB parser limit. If body parsing ran before
    // auth (the old global express.json), this would be 413; with parsing behind
    // auth, an unauthenticated request is 401 and the body is never parsed.
    const big = "x".repeat(200 * 1024);
    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: big } })
    });
    expect(res.status).toBe(401);
  });
});

const describeTls = tlsFixtures ? describe : describe.skip;

describeTls("in-app TLS and mutual TLS", () => {
  const fx = tlsFixtures!;
  const mtls: TlsConfig = {
    certPath: fx.serverCert,
    keyPath: fx.serverKey,
    clientCaPath: fx.clientCaCert
  };
  const serverCa = () => readFileSync(fx.serverCert);

  it("rejects a client with no certificate when mTLS is on", async () => {
    const { app } = createWinBridgeApp(makeConfig());
    const { server, scheme } = createServerForApp(app, mtls);
    expect(scheme).toBe("https");
    const port = await listen(server);

    await expect(httpsPost(port, { ca: serverCa(), token: "admin-token" })).rejects.toThrow();
  });

  it("accepts a client with a valid certificate, then still enforces the bearer token", async () => {
    const { app } = createWinBridgeApp(makeConfig());
    const { server } = createServerForApp(app, mtls);
    const port = await listen(server);

    const cert = readFileSync(fx.clientCert);
    const key = readFileSync(fx.clientKey);

    // Valid client cert but no bearer token: TLS + mTLS pass, auth rejects with 401.
    const result = await httpsPost(port, { ca: serverCa(), cert, key });
    expect(result.statusCode).toBe(401);
  });
});

describe("MCP tool calls: policy + audit", () => {
  function tempAudit(): string {
    const dir = mkdtempSync(join(tmpdir(), "winbridge-int-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return join(dir, "audit.jsonl");
  }

  async function connectClient(config: AppConfig, principal: Principal, auditPath: string) {
    const sessions = new PowerShellSessionManager(config);
    const audit = createAuditLogger(auditPath);
    const server = createWinBridgeMcpServer(config, sessions, principal, audit);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    cleanups.push(() => {
      sessions.closeAll();
      void client.close();
      void server.close();
    });
    return client;
  }

  it("blocks a globally denied command and audits the denial", async () => {
    const auditPath = tempAudit();
    const config = makeConfig();
    const client = await connectClient(config, config.principals[0], auditPath);

    const result = (await client.callTool({
      name: "powershell_execute",
      arguments: { command: "Remove-Item -Recurse C:/data" }
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("blocked");
    expect(result.content[0].text).toContain("denylist");

    const log = readFileSync(auditPath, "utf8");
    expect(log).toContain("\"decision\":\"blocked\"");
    expect(log).toContain("\"principal\":\"default\"");
  });

  it("enforces a per-principal denylist on top of the global one", async () => {
    const auditPath = tempAudit();
    const [alice] = parsePrincipals(
      JSON.stringify([{ name: "alice", role: "readonly", token: "alice-token", deny: ["Get-Secret"] }]),
      {}
    );
    const config = makeConfig({ principals: [alice] });
    const client = await connectClient(config, alice, auditPath);

    const result = (await client.callTool({
      name: "powershell_execute",
      arguments: { command: "Get-Secret -Name vault" }
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("alice");
  });

  it("allows a permitted tool call and audits it", async () => {
    const auditPath = tempAudit();
    const config = makeConfig();
    const client = await connectClient(config, config.principals[0], auditPath);

    // open_session returns immediately without requiring a live shell.
    const result = (await client.callTool({
      name: "powershell_open_session",
      arguments: {}
    })) as { isError?: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBeFalsy();
    const info = JSON.parse(result.content[0].text) as { sessionId: string };
    expect(info.sessionId).toBeTruthy();

    const log = readFileSync(auditPath, "utf8");
    expect(log).toContain("\"decision\":\"allowed\"");
    expect(log).toContain("\"tool\":\"powershell_open_session\"");
  });
});

describe("take_screenshot gating", () => {
  const screenshot = (enabled: boolean, allowedRoles: string[]) => ({
    enabled,
    allowedRoles,
    dir: join(tmpdir(), "winbridge-shots-test"),
    retentionMs: 0
  });

  async function listToolNames(config: AppConfig, principal: Principal): Promise<string[]> {
    const sessions = new PowerShellSessionManager(config);
    const audit = createAuditLogger(undefined);
    const server = createWinBridgeMcpServer(config, sessions, principal, audit);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    cleanups.push(() => {
      sessions.closeAll();
      void client.close();
      void server.close();
    });
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  }

  // createPrimaryPrincipal gives role "admin".
  const admin = () => createPrimaryPrincipal("admin-token", { allow: [], deny: [] });

  it("does not register the tool when screenshots are disabled", async () => {
    const names = await listToolNames(makeConfig({ screenshot: screenshot(false, []) }), admin());
    expect(names).not.toContain("take_screenshot");
  });

  it("registers the tool when enabled with no role restriction", async () => {
    const names = await listToolNames(makeConfig({ screenshot: screenshot(true, []) }), admin());
    expect(names).toContain("take_screenshot");
  });

  it("registers the tool when the principal's role is permitted", async () => {
    const names = await listToolNames(makeConfig({ screenshot: screenshot(true, ["admin"]) }), admin());
    expect(names).toContain("take_screenshot");
  });

  it("does not register the tool when the principal's role is not permitted", async () => {
    const names = await listToolNames(makeConfig({ screenshot: screenshot(true, ["operator"]) }), admin());
    expect(names).not.toContain("take_screenshot");
  });
});

describe("file transfer gating", () => {
  async function listToolNames(config: AppConfig, principal: Principal): Promise<string[]> {
    const sessions = new PowerShellSessionManager(config);
    const audit = createAuditLogger(undefined);
    const server = createWinBridgeMcpServer(config, sessions, principal, audit);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    cleanups.push(() => {
      sessions.closeAll();
      void client.close();
      void server.close();
    });
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  }

  const admin = () => createPrimaryPrincipal("admin-token", { allow: [], deny: [] });

  it("does not register the tools when no root is configured", async () => {
    const names = await listToolNames(makeConfig(), admin());
    expect(names).not.toContain("file_upload");
    expect(names).not.toContain("file_download");
  });

  it("registers both tools when a root is configured", async () => {
    const config = makeConfig({
      fileTransfer: { enabled: true, root: join(tmpdir(), "winbridge-files-test"), maxBytes: 1024 }
    });
    const names = await listToolNames(config, admin());
    expect(names).toContain("file_upload");
    expect(names).toContain("file_download");
  });

  // Regression guard for the JSON body limit: over HTTP the SDK's default 100 kB
  // body-parser limit would 413 an upload well below WINBRIDGE_MAX_FILE_BYTES.
  it("uploads and downloads a file larger than 100 kB over HTTP", async () => {
    const root = mkdtempSync(join(tmpdir(), "winbridge-http-ft-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    // 300 kB payload with the cap set exactly at its size: this exercises the
    // body-limit envelope slack (a file AT the cap must pass the JSON parser)
    // as well as the >100 kB body that the old 100 kB default would have 413'd.
    const payload = Buffer.alloc(300 * 1024, 7); // ~400 kB base64
    const config = makeConfig({ fileTransfer: { enabled: true, root, maxBytes: payload.length } });

    const { app } = createWinBridgeApp(config);
    const { server } = createServerForApp(app, undefined);
    const port = await listen(server);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: "Bearer admin-token" } }
      })
    );
    cleanups.push(() => void client.close());

    const up = (await client.callTool({
      name: "file_upload",
      arguments: { path: "large.bin", content: payload.toString("base64") }
    })) as { content: Array<{ text: string }> };
    const upResult = JSON.parse(up.content[0].text) as { success: boolean; bytes: number };
    expect(upResult.success).toBe(true);
    expect(upResult.bytes).toBe(payload.length);

    const down = (await client.callTool({
      name: "file_download",
      arguments: { path: "large.bin" }
    })) as { content: Array<{ text: string }> };
    const downResult = JSON.parse(down.content[0].text) as { success: boolean; base64: string };
    expect(downResult.success).toBe(true);
    expect(Buffer.from(downResult.base64, "base64").equals(payload)).toBe(true);
  });
});

describe("per-principal tool allowlist", () => {
  async function listToolNames(config: AppConfig, principal: Principal): Promise<string[]> {
    const sessions = new PowerShellSessionManager(config);
    const audit = createAuditLogger(undefined);
    const server = createWinBridgeMcpServer(config, sessions, principal, audit);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    cleanups.push(() => {
      sessions.closeAll();
      void client.close();
      void server.close();
    });
    const { tools } = await client.listTools();
    return tools.map((tool) => tool.name);
  }

  const principal = (tools?: string[]): Principal => ({
    name: "p",
    role: "user",
    token: "t",
    policy: { allow: [], deny: [] },
    tools
  });

  it("exposes every powershell tool when no allowlist is set", async () => {
    const names = await listToolNames(makeConfig(), principal(undefined));
    expect(names).toContain("powershell_execute");
    expect(names).toContain("powershell_open_session");
    expect(names).toContain("powershell_list_sessions");
  });

  it("restricts a principal to exactly its listed tools", async () => {
    const names = await listToolNames(makeConfig(), principal(["powershell_execute"]));
    expect(names).toEqual(["powershell_execute"]);
    expect(names).not.toContain("powershell_list_sessions");
  });

  it("composes with the screenshot gate (needs both enabled and allowlisted)", async () => {
    const enabled = makeConfig({
      screenshot: { enabled: true, allowedRoles: [], dir: join(tmpdir(), "s"), retentionMs: 0 }
    });
    // Allowlisted + globally enabled -> present.
    const withShot = await listToolNames(enabled, principal(["powershell_execute", "take_screenshot"]));
    expect(withShot).toContain("take_screenshot");

    // Globally enabled but not in the principal's allowlist -> hidden.
    const withoutShot = await listToolNames(enabled, principal(["powershell_execute"]));
    expect(withoutShot).not.toContain("take_screenshot");

    // In the allowlist but globally disabled -> still hidden.
    const disabled = await listToolNames(makeConfig(), principal(["powershell_execute", "take_screenshot"]));
    expect(disabled).not.toContain("take_screenshot");
  });
});
