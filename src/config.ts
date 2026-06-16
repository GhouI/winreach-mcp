import type { TunnelProvider } from "./tunnel.js";

export type TunnelConfig = {
  enabled: boolean;
  provider: TunnelProvider;
  autoInstall: boolean;
  binaryPath?: string;
};

export type AppConfig = {
  name: string;
  version: string;
  host: string;
  port: number;
  endpointPath: string;
  authToken: string;
  allowedOrigins: string[];
  shellPath?: string;
  defaultCwd: string;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  tunnel: TunnelConfig;
};

const DEFAULT_PORT = 7573;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * Read an env var by its primary `WINBRIDGE_*` name, falling back to the legacy
 * `PENDRAGON_*` name for backward compatibility.
 */
function readEnv(name: string): string | undefined {
  const primary = process.env[`WINBRIDGE_${name}`];
  if (primary !== undefined) {
    return primary;
  }
  return process.env[`PENDRAGON_${name}`];
}

function readNumberEnv(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`WINBRIDGE_${name} must be a positive number`);
  }

  return parsed;
}

function readListEnv(name: string): string[] {
  const raw = readEnv(name);
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = readEnv(name);
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function loadTunnelConfig(): TunnelConfig {
  const raw = readEnv("TUNNEL")?.trim().toLowerCase();
  const enabled = raw !== undefined && raw !== "" && raw !== "off" && raw !== "false" && raw !== "none";

  if (enabled && raw !== "cloudflare" && raw !== "on" && raw !== "true" && raw !== "1") {
    throw new Error(`Unsupported WINBRIDGE_TUNNEL value "${raw}". Use "cloudflare".`);
  }

  return {
    enabled,
    provider: "cloudflare",
    autoInstall: readBoolEnv("TUNNEL_AUTOINSTALL", true),
    binaryPath: readEnv("CLOUDFLARED_PATH")
  };
}

export function loadConfig(): AppConfig {
  const authToken = readEnv("TOKEN");
  if (!authToken) {
    throw new Error("WINBRIDGE_TOKEN is required");
  }

  return {
    name: "winbridge-mcp",
    version: "0.2.0",
    host: readEnv("HOST") ?? "127.0.0.1",
    port: readNumberEnv("PORT", DEFAULT_PORT),
    endpointPath: readEnv("ENDPOINT_PATH") ?? "/mcp",
    authToken,
    allowedOrigins: readListEnv("ALLOWED_ORIGINS"),
    shellPath: readEnv("SHELL_PATH"),
    defaultCwd: readEnv("CWD") ?? process.cwd(),
    defaultTimeoutMs: readNumberEnv("TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxOutputBytes: readNumberEnv("MAX_OUTPUT_BYTES", DEFAULT_MAX_OUTPUT_BYTES),
    tunnel: loadTunnelConfig()
  };
}
