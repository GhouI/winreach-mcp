import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TunnelProvider } from "./tunnel.js";
import type { TlsConfig } from "./tls.js";
import { compilePatterns, type CommandPolicy } from "./policy.js";
import {
  assertUniqueTokens,
  createPrimaryPrincipal,
  parsePrincipals,
  type Principal
} from "./principals.js";

export type TunnelConfig = {
  enabled: boolean;
  provider: TunnelProvider;
  autoInstall: boolean;
  binaryPath?: string;
};

/**
 * Authorization for the `take_screenshot` tool. Screen capture is a read/exfil
 * capability the command policy cannot express (there is no command string), so
 * it is disabled by default and gated separately.
 */
export type ScreenshotConfig = {
  /** When false the tool is not registered at all. */
  enabled: boolean;
  /** Roles permitted to capture. Empty means any authenticated principal. */
  allowedRoles: string[];
  /** Server-owned directory captures are written to. Callers cannot override it. */
  dir: string;
  /** Captures older than this are deleted. `0` disables the retention sweep. */
  retentionMs: number;
};

/**
 * Authorization for the file-transfer tools (`file_upload` / `file_download`).
 * These read and write host files, bypassing the command policy, so they are
 * only enabled when the operator configures a root directory. Every path is
 * confined to that root, so a transfer can never touch files outside it.
 */
export type FileTransferConfig = {
  /** True when a root is configured; the tools are only registered then. */
  enabled: boolean;
  /** Absolute sandbox root. All transfer paths resolve within it. */
  root?: string;
  /** Maximum bytes per transferred file, in either direction. */
  maxBytes: number;
};

export type AppConfig = {
  name: string;
  version: string;
  host: string;
  port: number;
  endpointPath: string;
  /** Authenticated identities. Always contains at least one principal. */
  principals: Principal[];
  /** Deployment-wide command policy applied to every principal. */
  globalPolicy: CommandPolicy;
  /** Path to the JSONL audit log, or undefined to disable auditing. */
  auditLogPath?: string;
  /** In-app TLS/mTLS settings, or undefined for plain HTTP. */
  tls?: TlsConfig;
  /** Screen-capture authorization. Disabled unless explicitly turned on. */
  screenshot: ScreenshotConfig;
  /** File-transfer authorization. Disabled unless a root directory is set. */
  fileTransfer: FileTransferConfig;
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

/**
 * Read a list of regex patterns. Accepts either a JSON array (use this when a
 * pattern itself contains commas, e.g. `\d{1,3}`) or a plain comma-separated
 * list for simple cases.
 */
function readPatternListEnv(name: string): string[] {
  const raw = readEnv(name)?.trim();
  if (!raw) {
    return [];
  }

  if (raw.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`WINBRIDGE_${name} must be valid JSON: ${detail}`);
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error(`WINBRIDGE_${name} JSON must be an array of strings`);
    }
    return (parsed as string[]).map((value) => value.trim()).filter(Boolean);
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

const DEFAULT_SCREENSHOT_RETENTION_HOURS = 8;

/** Retention hours: non-negative, where `0` disables the sweep (keep forever). */
function readScreenshotRetentionHours(): number {
  const raw = readEnv("SCREENSHOT_RETENTION_HOURS")?.trim();
  if (!raw) {
    return DEFAULT_SCREENSHOT_RETENTION_HOURS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("WINBRIDGE_SCREENSHOT_RETENTION_HOURS must be a non-negative number");
  }
  return parsed;
}

function loadScreenshotConfig(): ScreenshotConfig {
  return {
    enabled: readBoolEnv("ALLOW_SCREENSHOT", false),
    allowedRoles: readListEnv("SCREENSHOT_ROLES"),
    dir: readEnv("SCREENSHOT_DIR")?.trim() || join(tmpdir(), "winbridge-screenshots"),
    retentionMs: readScreenshotRetentionHours() * 60 * 60 * 1000
  };
}

const DEFAULT_MAX_FILE_BYTES = 75 * 1024 * 1024;

function loadFileTransferConfig(): FileTransferConfig {
  const rawRoot = readEnv("FILE_ROOT")?.trim();
  const root = rawRoot ? resolve(rawRoot) : undefined;
  return {
    enabled: Boolean(root),
    root,
    maxBytes: readNumberEnv("MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES)
  };
}

function loadGlobalPolicy(): CommandPolicy {
  return {
    allow: compilePatterns(readPatternListEnv("COMMAND_ALLOWLIST"), "WINBRIDGE_COMMAND_ALLOWLIST"),
    deny: compilePatterns(readPatternListEnv("COMMAND_DENYLIST"), "WINBRIDGE_COMMAND_DENYLIST")
  };
}

function loadTlsConfig(): TlsConfig | undefined {
  const certPath = readEnv("TLS_CERT")?.trim();
  const keyPath = readEnv("TLS_KEY")?.trim();
  const clientCaPath = readEnv("TLS_CLIENT_CA")?.trim();
  const passphrase = readEnv("TLS_KEY_PASSPHRASE");

  if (!certPath && !keyPath) {
    if (clientCaPath) {
      throw new Error("WINBRIDGE_TLS_CLIENT_CA requires WINBRIDGE_TLS_CERT and WINBRIDGE_TLS_KEY (mTLS needs TLS).");
    }
    return undefined;
  }

  if (!certPath || !keyPath) {
    throw new Error("Both WINBRIDGE_TLS_CERT and WINBRIDGE_TLS_KEY must be set to enable TLS.");
  }

  return {
    certPath,
    keyPath,
    passphrase: passphrase || undefined,
    clientCaPath: clientCaPath || undefined
  };
}

/**
 * Build the principal list from the legacy single token and/or the
 * WINBRIDGE_PRINCIPALS array. At least one principal is required.
 */
function loadPrincipals(): Principal[] {
  const principals: Principal[] = [];

  const token = readEnv("TOKEN");
  if (token) {
    // The legacy single token is a full-access admin; the global policy still
    // applies to it. Its per-principal policy is empty (unrestricted).
    principals.push(createPrimaryPrincipal(token, { allow: [], deny: [] }));
  }

  const principalsJson = readEnv("PRINCIPALS")?.trim();
  if (principalsJson) {
    principals.push(...parsePrincipals(principalsJson, process.env));
  }

  if (principals.length === 0) {
    throw new Error("WINBRIDGE_TOKEN or WINBRIDGE_PRINCIPALS is required");
  }

  assertUniqueTokens(principals);
  return principals;
}

export function loadConfig(): AppConfig {
  const globalPolicy = loadGlobalPolicy();

  return {
    name: "winbridge-mcp",
    version: "0.2.0",
    host: readEnv("HOST") ?? "127.0.0.1",
    port: readNumberEnv("PORT", DEFAULT_PORT),
    endpointPath: readEnv("ENDPOINT_PATH") ?? "/mcp",
    principals: loadPrincipals(),
    globalPolicy,
    auditLogPath: readEnv("AUDIT_LOG")?.trim() || undefined,
    tls: loadTlsConfig(),
    screenshot: loadScreenshotConfig(),
    fileTransfer: loadFileTransferConfig(),
    allowedOrigins: readListEnv("ALLOWED_ORIGINS"),
    shellPath: readEnv("SHELL_PATH"),
    defaultCwd: readEnv("CWD") ?? process.cwd(),
    defaultTimeoutMs: readNumberEnv("TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    maxOutputBytes: readNumberEnv("MAX_OUTPUT_BYTES", DEFAULT_MAX_OUTPUT_BYTES),
    tunnel: loadTunnelConfig()
  };
}

/** The shortest principal token length, used for weak-token warnings. */
export function shortestTokenLength(principals: Principal[]): number {
  return principals.reduce((min, principal) => Math.min(min, principal.token.length), Infinity);
}
