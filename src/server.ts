import { pathToFileURL } from "node:url";
import type { AppConfig } from "./config.js";
import { loadConfig, shortestTokenLength } from "./config.js";
import { createWinReachApp } from "./mcpServer.js";
import { sweepOldScreenshots } from "./powershell/screenshot.js";
import { createServerForApp } from "./tls.js";
import { startCloudflareTunnel, startNamedCloudflareTunnel, type TunnelHandle } from "./tunnel.js";

function printConnectionHelp(mcpUrl: string): void {
  console.log("");
  console.log("Connect an agent with this public endpoint (the bearer token is still required):");
  console.log("");
  console.log("Claude Code:");
  console.log(`  claude mcp add --transport http winreach ${mcpUrl} --header "Authorization: Bearer <WINREACH_TOKEN>"`);
  console.log("");
  console.log("Codex (~/.codex/config.toml):");
  console.log("  [mcp_servers.winreach]");
  console.log(`  url = "${mcpUrl}"`);
  console.log('  bearer_token_env_var = "WINREACH_TOKEN"');
  console.log("  enabled = true");
  console.log("");
}

export async function main(): Promise<void> {
  const config = loadConfig();
  const tunnelRequested = config.tunnel.enabled || process.argv.includes("--tunnel");
  const { app, sessions } = createWinReachApp(config);

  if (config.screenshot.enabled) {
    // Prune any captures left over from a previous run before serving requests.
    const removed = sweepOldScreenshots(config.screenshot.dir, config.screenshot.retentionMs);
    if (removed > 0) {
      console.log(`Removed ${removed} expired screenshot(s) from ${config.screenshot.dir}.`);
    }
  }

  const { server: httpServer, scheme } = createServerForApp(app, config.tls);
  httpServer.listen(config.port, config.host, () => {
    console.log(`WinReach MCP listening at ${scheme}://${config.host}:${config.port}${config.endpointPath}`);
    if (config.tls?.clientCaPath) {
      console.log("Mutual TLS is enabled: clients must present a certificate trusted by the configured CA.");
    }
  });

  let tunnel: TunnelHandle | undefined;
  if (tunnelRequested) {
    if (config.tls) {
      console.warn(
        "Warning: tunnel mode terminates TLS at Cloudflare and forwards to WinReach over loopback. " +
          "In-app TLS/mTLS is not applied to tunnel traffic; rely on the bearer token over the tunnel."
      );
    }
    if (shortestTokenLength(config.principals) < 24) {
      console.warn(
        "Warning: a WinReach token is short. Tunnel mode exposes this remote-command server to the public " +
          "internet (protected only by the bearer token). Use a long random token, e.g. 32+ characters."
      );
    }
    try {
      tunnel = await startTunnel(config);
      const named = Boolean(config.tunnel.token && config.tunnel.hostname);
      console.log(
        named
          ? `Named Cloudflare tunnel ready (stable hostname): ${tunnel.publicUrl}`
          : `Cloudflare tunnel ready: ${tunnel.publicUrl}`
      );
      console.log(`Public MCP endpoint: ${tunnel.mcpUrl}`);
      printConnectionHelp(tunnel.mcpUrl);
    } catch (error) {
      console.error("Failed to start the Cloudflare tunnel:", error instanceof Error ? error.message : error);
      console.error("WinReach is still reachable on the local endpoint above.");
    }
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    sessions.closeAll();
    const finish = () => httpServer.close(() => process.exit(0));
    if (tunnel) {
      void tunnel.stop().finally(finish);
    } else {
      finish();
    }
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function startTunnel(config: AppConfig): Promise<TunnelHandle> {
  const { tunnel, endpointPath, port } = config;

  // Named mode: the operator supplied their own tunnel token + hostname. Ingress
  // (hostname -> service) lives in Cloudflare, so no localUrl is passed.
  if (tunnel.token && tunnel.hostname) {
    return startNamedCloudflareTunnel({
      token: tunnel.token,
      hostname: tunnel.hostname,
      endpointPath,
      autoInstall: tunnel.autoInstall,
      binaryPath: tunnel.binaryPath
    });
  }

  // Quick mode (zero-config default). cloudflared connects to WinReach over
  // loopback, so the public tunnel needs no inbound firewall rule and no
  // 0.0.0.0 bind.
  return startCloudflareTunnel({
    localUrl: `http://127.0.0.1:${port}`,
    endpointPath,
    autoInstall: tunnel.autoInstall,
    binaryPath: tunnel.binaryPath
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
