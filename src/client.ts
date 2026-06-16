import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseClientArgs, resolveClientTargets, type ClientTarget } from "./clientTargets.js";

async function main(): Promise<void> {
  const parsedArgs = parseClientArgs(process.argv.slice(2));
  const targets = resolveClientTargets(process.env, parsedArgs.urls);
  let failed = false;

  for (const target of targets) {
    try {
      const result = await runTargetCommand(target, parsedArgs.command, parsedArgs.toolName, parsedArgs.argParts);
      printResult(target, result, targets.length > 1);
    } catch (error) {
      failed = true;
      printError(target, error, targets.length > 1);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

async function runTargetCommand(
  target: ClientTarget,
  command: string | undefined,
  toolName: string | undefined,
  argParts: string[]
): Promise<unknown> {
  const client = new Client({
    name: "winbridge-diagnostic-client",
    version: "0.2.0"
  });

  const transport = new StreamableHTTPClientTransport(new URL(target.url), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${target.token}`
      }
    }
  });

  await client.connect(transport);

  try {
    if (command === "exec") {
      const powershellCommand = [toolName, ...argParts].filter(Boolean).join(" ");
      return await client.callTool({
        name: "powershell_execute",
        arguments: {
          command: powershellCommand
        }
      });
    }

    if (command === "list-tools") {
      const result = await client.listTools();
      return result.tools;
    }

    if (command === "call-tool" && toolName) {
      const rawArgs = argParts.join(" ");
      const args = rawArgs ? JSON.parse(rawArgs) : {};
      return await client.callTool({
        name: toolName,
        arguments: args
      });
    }

    return usageText();
  } finally {
    await transport.close();
  }
}

function printResult(target: ClientTarget, result: unknown, includeTarget: boolean): void {
  if (!includeTarget) {
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        target: {
          name: target.name,
          url: target.url
        },
        result
      },
      null,
      2
    )
  );
}

function printError(target: ClientTarget, error: unknown, includeTarget: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  if (!includeTarget) {
    console.error(message);
    return;
  }

  console.error(
    JSON.stringify(
      {
        target: {
          name: target.name,
          url: target.url
        },
        error: message
      },
      null,
      2
    )
  );
}

function usageText(): string {
  return [
    "Usage:",
    "  npm run client -- list-tools",
    "  npm run client -- exec Write-Output hello",
    "  npm run client -- call-tool powershell_execute '{\"command\":\"Write-Output hello\"}'",
    "",
    "Targets:",
    "  WINBRIDGE_URL=http://127.0.0.1:7573/mcp",
    "  WINBRIDGE_URLS=http://win-1:7573/mcp,http://win-2:7573/mcp",
    "  npm run client -- --url http://win-1:7573/mcp --url http://win-2:7573/mcp exec hostname"
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
