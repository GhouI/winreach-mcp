import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment
} from "@modelcontextprotocol/sdk/client/stdio.js";

// Launch the real CLI (`src/cli.ts --stdio`) through tsx and speak MCP over
// stdio, asserting the server initializes and lists its tools. This exercises
// the whole stdio path end to end without needing a prior build.
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const cliSource = join(repoRoot, "src", "cli.ts");
const tsxCli = join(dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");

let transport: StdioClientTransport | undefined;

afterEach(async () => {
  await transport?.close();
  transport = undefined;
});

describe("stdio transport", () => {
  it("starts and lists tools over stdio", async () => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, cliSource, "--stdio"],
      env: { ...getDefaultEnvironment(), WINREACH_TOKEN: "stdio-smoke-test-token-1234567890" },
      stderr: "ignore"
    });

    const client = new Client({ name: "stdio-smoke-test", version: "0.0.0" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    // PowerShell tools are always registered; the gated tools stay off by default.
    expect(names).toContain("powershell_execute");
    expect(names).toContain("powershell_open_session");

    await client.close();
  }, 30000);
});
