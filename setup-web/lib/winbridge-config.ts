// Pure helpers that turn the wizard state into ready-to-paste WinBridge config,
// firewall rules, and agent-connect snippets. No React / DOM here so this stays
// easy to reason about and test.

/** Every MCP tool a principal can be granted. */
export const TOOL_NAMES = [
  "powershell_execute",
  "powershell_open_session",
  "powershell_send",
  "powershell_close_session",
  "powershell_list_sessions",
  "take_screenshot",
  "file_upload",
  "file_download",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export type AuthMode = "single" | "users";

/** A per-user identity that becomes one WINBRIDGE_PRINCIPALS entry. */
export type WinBridgeUser = {
  id: string; // UI key only; never emitted to config
  name: string;
  role: string;
  token: string;
  /** true = the key may use every tool (omit `tools`); false = restrict to `tools`. */
  allTools: boolean;
  tools: string[];
  allow: string[];
  deny: string[];
};

/** Role presets applied when a role is chosen (still editable afterward). */
export const ROLE_PRESETS: Record<
  string,
  { allTools: boolean; tools: string[]; allow: string[]; deny: string[] }
> = {
  admin: { allTools: true, tools: [], allow: [], deny: [] },
  operator: {
    allTools: true,
    tools: [],
    allow: [],
    deny: ["Remove-Item", "Format-Volume", "Stop-Computer", "Stop-Service"],
  },
  readonly: { allTools: false, tools: ["powershell_execute"], allow: ["^Get-", "^Test-"], deny: [] },
  custom: { allTools: true, tools: [], allow: [], deny: [] },
};

export type WinBridgeConfig = {
  host: string;
  port: number;
  endpointPath: string;
  authMode: AuthMode;
  token: string;
  users: WinBridgeUser[];
  allowedOrigins: string[];
  screenshot: {
    enabled: boolean;
    roles: string[];
    retentionHours: number;
  };
  fileTransfer: {
    enabled: boolean;
    root: string;
    maxBytesMB: number;
  };
  policy: {
    allow: string[];
    deny: string[];
  };
  tls: {
    certPath: string;
    keyPath: string;
    clientCaPath: string;
  };
  allowedIps: string[];
  tunnel: boolean;
};

export const DEFAULT_CONFIG: WinBridgeConfig = {
  host: "127.0.0.1",
  port: 7573,
  endpointPath: "/mcp",
  authMode: "single",
  token: "",
  users: [],
  allowedOrigins: [],
  screenshot: { enabled: false, roles: [], retentionHours: 8 },
  fileTransfer: { enabled: false, root: "", maxBytesMB: 75 },
  policy: { allow: [], deny: [] },
  tls: { certPath: "", keyPath: "", clientCaPath: "" },
  allowedIps: [],
  tunnel: false,
};

export type EnvVar = { name: string; value: string };

/** Split a comma/newline separated string into a trimmed, non-empty list. */
export function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** A cryptographically-random hex token for a bearer key (browser only). */
export function generateToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The scalar WINBRIDGE_* environment variables implied by the config. The auth
 * variable is handled separately: WINBRIDGE_TOKEN here in single mode, and
 * WINBRIDGE_PRINCIPALS (a here-string) added by buildPowerShellEnv in users mode.
 */
export function buildEnvVars(cfg: WinBridgeConfig): EnvVar[] {
  const env: EnvVar[] = [];
  const push = (name: string, value: string | number | undefined) => {
    if (value === undefined || value === "") return;
    env.push({ name, value: String(value) });
  };

  if (cfg.authMode !== "users") {
    push("WINBRIDGE_TOKEN", cfg.token || "REPLACE_WITH_A_LONG_RANDOM_TOKEN");
  }
  push("WINBRIDGE_HOST", cfg.host);
  push("WINBRIDGE_PORT", cfg.port);
  if (cfg.endpointPath && cfg.endpointPath !== "/mcp") push("WINBRIDGE_ENDPOINT_PATH", cfg.endpointPath);
  if (cfg.allowedOrigins.length) push("WINBRIDGE_ALLOWED_ORIGINS", cfg.allowedOrigins.join(","));

  if (cfg.screenshot.enabled) {
    push("WINBRIDGE_ALLOW_SCREENSHOT", "1");
    if (cfg.screenshot.roles.length) push("WINBRIDGE_SCREENSHOT_ROLES", cfg.screenshot.roles.join(","));
    if (cfg.screenshot.retentionHours !== 8) push("WINBRIDGE_SCREENSHOT_RETENTION_HOURS", cfg.screenshot.retentionHours);
  }

  if (cfg.fileTransfer.enabled && cfg.fileTransfer.root) {
    push("WINBRIDGE_FILE_ROOT", cfg.fileTransfer.root);
    if (cfg.fileTransfer.maxBytesMB !== 75) {
      push("WINBRIDGE_MAX_FILE_BYTES", Math.round(cfg.fileTransfer.maxBytesMB * 1024 * 1024));
    }
  }

  if (cfg.policy.allow.length) push("WINBRIDGE_COMMAND_ALLOWLIST", cfg.policy.allow.join(","));
  if (cfg.policy.deny.length) push("WINBRIDGE_COMMAND_DENYLIST", cfg.policy.deny.join(","));

  if (cfg.tls.certPath && cfg.tls.keyPath) {
    push("WINBRIDGE_TLS_CERT", cfg.tls.certPath);
    push("WINBRIDGE_TLS_KEY", cfg.tls.keyPath);
    if (cfg.tls.clientCaPath) push("WINBRIDGE_TLS_CLIENT_CA", cfg.tls.clientCaPath);
  }

  if (cfg.tunnel) push("WINBRIDGE_TUNNEL", "cloudflare");

  return env;
}

/** Escape a value for a PowerShell double-quoted string. */
function psQuote(value: string): string {
  return `"${value.replace(/`/g, "``").replace(/"/g, '`"')}"`;
}

/** The WINBRIDGE_PRINCIPALS JSON array (pretty-printed) for the configured users. */
export function buildPrincipalsJson(cfg: WinBridgeConfig): string {
  const entries = cfg.users.map((u) => {
    const entry: Record<string, unknown> = {
      name: u.name.trim() || "user",
      role: u.role || "user",
      token: u.token || "REPLACE_WITH_A_TOKEN",
    };
    if (u.allow.length) entry.allow = u.allow;
    if (u.deny.length) entry.deny = u.deny;
    // `tools` is only emitted when it is a real restriction; omitting it means all tools.
    if (!u.allTools) entry.tools = u.tools;
    return entry;
  });
  return JSON.stringify(entries, null, 2);
}

/** PowerShell env block: WINBRIDGE_TOKEN or WINBRIDGE_PRINCIPALS, then the scalars. */
export function buildPowerShellEnv(cfg: WinBridgeConfig): string {
  const lines: string[] = [];
  if (cfg.authMode === "users") {
    // Here-string: the closing '@ must sit at column 0.
    lines.push(`$env:WINBRIDGE_PRINCIPALS = @'\n${buildPrincipalsJson(cfg)}\n'@`);
  }
  for (const e of buildEnvVars(cfg)) {
    lines.push(`$env:${e.name} = ${psQuote(e.value)}`);
  }
  return lines.join("\n");
}

const scheme = (cfg: WinBridgeConfig) => (cfg.tls.certPath && cfg.tls.keyPath ? "https" : "http");

/** The URL an agent connects to (uses the bind host; swap for a reachable host/IP as needed). */
export function connectUrl(cfg: WinBridgeConfig): string {
  return `${scheme(cfg)}://${cfg.host}:${cfg.port}${cfg.endpointPath}`;
}

/** A complete start-*.ps1 script: env, install, run. */
export function buildStartScript(cfg: WinBridgeConfig): string {
  const lines = [
    "# WinBridge MCP - generated start script",
    "# Review before running. Run from the winbridge-mcp checkout.",
    "",
    buildPowerShellEnv(cfg),
    "",
    "npm install",
    "npm run dev",
    "",
  ];
  return lines.join("\n");
}

/** Windows firewall rule scoping the MCP port to the allowed source IPs/CIDRs. */
export function buildFirewallRule(cfg: WinBridgeConfig): string {
  const remote =
    cfg.allowedIps.length > 0
      ? cfg.allowedIps.map((ip) => `"${ip}"`).join(", ")
      : '"Any"';
  const warn =
    cfg.allowedIps.length > 0
      ? ""
      : "# WARNING: no allowed IPs set -> RemoteAddress Any. Restrict this to your corporate ranges.\n";
  return (
    `${warn}New-NetFirewallRule ` +
    "`\n" +
    `  -DisplayName "WinBridge MCP ${cfg.port}" ` +
    "`\n" +
    "  -Direction Inbound `\n" +
    "  -Protocol TCP `\n" +
    `  -LocalPort ${cfg.port} ` +
    "`\n" +
    `  -RemoteAddress ${remote} ` +
    "`\n" +
    "  -Action Allow"
  );
}

/** `claude mcp add` command(s) for Claude Code — per-user tokens in users mode. */
export function buildClaudeConfig(cfg: WinBridgeConfig): string {
  const url = connectUrl(cfg);
  if (cfg.authMode === "users") {
    if (!cfg.users.length) {
      return "# Add users in the Access stage to generate per-user connect commands.";
    }
    return cfg.users
      .map((u) => {
        const name = u.name.trim() || "user";
        const token = u.token || "<token>";
        return (
          `# ${name} (${u.role})\n` +
          `claude mcp add --transport http winbridge-${name} ${url} \`\n` +
          `  --header "Authorization: Bearer ${token}"`
        );
      })
      .join("\n\n");
  }
  return (
    `claude mcp add --transport http winbridge ${url} \`\n` +
    `  --header "Authorization: Bearer $env:WINBRIDGE_TOKEN"`
  );
}

/** `~/.codex/config.toml` block for Codex. */
export function buildCodexConfig(cfg: WinBridgeConfig): string {
  const lines = [
    "[mcp_servers.winbridge]",
    `url = "${connectUrl(cfg)}"`,
    'bearer_token_env_var = "WINBRIDGE_TOKEN"',
    "tool_timeout_sec = 120",
    "enabled = true",
  ];
  if (cfg.authMode === "users") {
    lines.push("", "# In multi-user mode each user connects with their own token (see Claude Code tab).");
  }
  return lines.join("\n");
}
