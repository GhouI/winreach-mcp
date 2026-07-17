#!/usr/bin/env node
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { generateToken } from "./token.js";

/**
 * A parsed CLI invocation. `start` runs the HTTP server (optionally opening a
 * tunnel), `stdio` runs the local stdio transport, `gen-token` prints a fresh
 * bearer token, and `help`/`version` are informational.
 */
export type CliCommand =
  | { kind: "start"; tunnel: boolean }
  | { kind: "stdio" }
  | { kind: "gen-token" }
  | { kind: "help" }
  | { kind: "version" };

const HELP = `winreach-mcp — remote/local MCP bridge for Windows

Usage:
  winreach-mcp [start] [--tunnel]   Start the Streamable-HTTP MCP server (default).
  winreach-mcp --stdio | stdio      Run over the stdio transport for a local MCP client.
  winreach-mcp gen-token            Print a fresh random bearer token and exit.
  winreach-mcp --help | -h          Show this help.
  winreach-mcp --version | -v       Print the version.

Environment (all optional except a token in HTTP mode):
  WINREACH_TOKEN        Bearer token. In --stdio mode an ephemeral one is minted if unset.
  WINREACH_HOST/PORT    HTTP bind address (default 127.0.0.1:7573).
  WINREACH_TUNNEL       Set to "cloudflare" to publish a public quick tunnel.
  See README / docs for the full WINREACH_* configuration reference.`;

/**
 * Classify argv (already sliced past `node script`) into a command. The first
 * bare word selects the subcommand; flags may appear in any position. `--stdio`
 * anywhere selects stdio mode; `start` is the default when nothing else matches.
 */
export function parseCliArgs(argv: string[]): CliCommand {
  const args = argv.map((a) => a.trim()).filter(Boolean);

  if (args.includes("--help") || args.includes("-h")) {
    return { kind: "help" };
  }
  if (args.includes("--version") || args.includes("-v")) {
    return { kind: "version" };
  }
  if (args.includes("--stdio") || args.includes("stdio")) {
    return { kind: "stdio" };
  }

  const subcommand = args.find((a) => !a.startsWith("-"));
  if (subcommand === "gen-token") {
    return { kind: "gen-token" };
  }

  // Default (no subcommand, or an explicit `start`) launches the HTTP server.
  // `--tunnel` is forwarded to the existing server entry point.
  return { kind: "start", tunnel: args.includes("--tunnel") };
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    // dist/src/cli.js -> ../../package.json at the package root.
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function runCli(argv: string[]): Promise<void> {
  const command = parseCliArgs(argv);

  switch (command.kind) {
    case "help":
      console.log(HELP);
      return;
    case "version":
      console.log(readVersion());
      return;
    case "gen-token":
      // Print only the token so it can be piped or captured directly.
      console.log(generateToken());
      return;
    case "stdio": {
      const { runStdio } = await import("./stdio.js");
      await runStdio();
      return;
    }
    case "start": {
      if (command.tunnel && !process.argv.includes("--tunnel")) {
        // The server entry reads process.argv for --tunnel; make sure it's there.
        process.argv.push("--tunnel");
      }
      const { main } = await import("./server.js");
      await main();
      return;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
