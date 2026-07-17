import { describe, expect, it } from "vitest";
import { parseClientArgs, resolveClientTargets } from "../src/clientTargets.js";

describe("parseClientArgs", () => {
  it("extracts repeated url flags", () => {
    expect(
      parseClientArgs([
        "--url",
        "http://win-1:7573/mcp",
        "--url=http://win-2:7573/mcp",
        "exec",
        "hostname"
      ])
    ).toEqual({
      urls: ["http://win-1:7573/mcp", "http://win-2:7573/mcp"],
      command: "exec",
      toolName: "hostname",
      argParts: []
    });
  });
});

describe("resolveClientTargets", () => {
  it("keeps the default single target behavior", () => {
    expect(resolveClientTargets({ WINREACH_TOKEN: "token" })).toEqual([
      {
        name: "default",
        url: "http://127.0.0.1:7573/mcp",
        token: "token"
      }
    ]);
  });

  it("resolves comma-separated urls with a shared token", () => {
    expect(
      resolveClientTargets({
        WINREACH_TOKEN: "token",
        WINREACH_URLS: "http://win-1:7573/mcp, http://win-2:7573/mcp"
      })
    ).toEqual([
      {
        name: "target-1",
        url: "http://win-1:7573/mcp",
        token: "token"
      },
      {
        name: "target-2",
        url: "http://win-2:7573/mcp",
        token: "token"
      }
    ]);
  });

  it("resolves JSON targets with per-target token env vars", () => {
    expect(
      resolveClientTargets({
        WINREACH_TARGETS: JSON.stringify([
          {
            name: "build-runner",
            url: "http://win-1:7573/mcp",
            tokenEnv: "WIN1_TOKEN"
          },
          {
            name: "test-runner",
            url: "http://win-2:7573/mcp",
            tokenEnv: "WIN2_TOKEN"
          }
        ]),
        WIN1_TOKEN: "one",
        WIN2_TOKEN: "two"
      })
    ).toEqual([
      {
        name: "build-runner",
        url: "http://win-1:7573/mcp",
        token: "one"
      },
      {
        name: "test-runner",
        url: "http://win-2:7573/mcp",
        token: "two"
      }
    ]);
  });

  it("lets explicit cli urls override env targets", () => {
    expect(
      resolveClientTargets(
        {
          WINREACH_TOKEN: "token",
          WINREACH_URLS: "http://ignored:7573/mcp"
        },
        ["http://cli:7573/mcp"]
      )
    ).toEqual([
      {
        name: "target-1",
        url: "http://cli:7573/mcp",
        token: "token"
      }
    ]);
  });

  it("prefers WINREACH_ env vars", () => {
    expect(
      resolveClientTargets({
        WINREACH_TOKEN: "winreach",
        WINREACH_URLS: "http://win-1:7573/mcp,http://win-2:7573/mcp"
      })
    ).toEqual([
      { name: "target-1", url: "http://win-1:7573/mcp", token: "winreach" },
      { name: "target-2", url: "http://win-2:7573/mcp", token: "winreach" }
    ]);
  });

  it("requires a token", () => {
    expect(() => resolveClientTargets({})).toThrow("WINREACH_TOKEN is required");
  });
});
