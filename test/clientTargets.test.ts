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
    expect(resolveClientTargets({ PENDRAGON_TOKEN: "token" })).toEqual([
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
        PENDRAGON_TOKEN: "token",
        PENDRAGON_URLS: "http://win-1:7573/mcp, http://win-2:7573/mcp"
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
        PENDRAGON_TARGETS: JSON.stringify([
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
          PENDRAGON_TOKEN: "token",
          PENDRAGON_URLS: "http://ignored:7573/mcp"
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

  it("prefers WINBRIDGE_ env vars", () => {
    expect(
      resolveClientTargets({
        WINBRIDGE_TOKEN: "winbridge",
        WINBRIDGE_URLS: "http://win-1:7573/mcp,http://win-2:7573/mcp"
      })
    ).toEqual([
      { name: "target-1", url: "http://win-1:7573/mcp", token: "winbridge" },
      { name: "target-2", url: "http://win-2:7573/mcp", token: "winbridge" }
    ]);
  });

  it("lets WINBRIDGE_ override legacy PENDRAGON_ values", () => {
    expect(
      resolveClientTargets({
        WINBRIDGE_TOKEN: "new",
        PENDRAGON_TOKEN: "old",
        WINBRIDGE_URL: "http://new:7573/mcp",
        PENDRAGON_URL: "http://old:7573/mcp"
      })
    ).toEqual([
      { name: "default", url: "http://new:7573/mcp", token: "new" }
    ]);
  });

  it("requires a token", () => {
    expect(() => resolveClientTargets({})).toThrow("WINBRIDGE_TOKEN is required");
  });
});
