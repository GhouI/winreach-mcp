// Bridges the wizard's raw form state (all strings, as typed) and the
// structured WinBridgeConfig used by the generators and the agent API.
// Pure functions only — no React/DOM.

import {
  DEFAULT_CONFIG,
  parseList,
  type WinBridgeConfig,
} from "@/lib/winbridge-config";

export type FormState = {
  host: string;
  port: string;
  endpointPath: string;
  token: string;
  allowedOrigins: string;
  screenshotEnabled: boolean;
  screenshotRoles: string;
  retentionHours: string;
  fileEnabled: boolean;
  fileRoot: string;
  maxBytesMB: string;
  allow: string;
  deny: string;
  certPath: string;
  keyPath: string;
  clientCaPath: string;
  allowedIps: string;
  tunnel: boolean;
};

export const INITIAL: FormState = {
  host: DEFAULT_CONFIG.host,
  port: String(DEFAULT_CONFIG.port),
  endpointPath: DEFAULT_CONFIG.endpointPath,
  token: "",
  allowedOrigins: "",
  screenshotEnabled: false,
  screenshotRoles: "",
  retentionHours: "8",
  fileEnabled: false,
  fileRoot: "",
  maxBytesMB: "75",
  allow: "",
  deny: "",
  certPath: "",
  keyPath: "",
  clientCaPath: "",
  allowedIps: "",
  tunnel: false,
};

export function toConfig(f: FormState): WinBridgeConfig {
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    host: f.host.trim() || "127.0.0.1",
    port: num(f.port, 7573),
    endpointPath: f.endpointPath.trim() || "/mcp",
    token: f.token.trim(),
    allowedOrigins: parseList(f.allowedOrigins),
    screenshot: {
      enabled: f.screenshotEnabled,
      roles: parseList(f.screenshotRoles),
      retentionHours: num(f.retentionHours, 8),
    },
    fileTransfer: {
      enabled: f.fileEnabled,
      root: f.fileRoot.trim(),
      maxBytesMB: num(f.maxBytesMB, 75),
    },
    policy: { allow: parseList(f.allow), deny: parseList(f.deny) },
    tls: {
      certPath: f.certPath.trim(),
      keyPath: f.keyPath.trim(),
      clientCaPath: f.clientCaPath.trim(),
    },
    allowedIps: parseList(f.allowedIps),
    tunnel: f.tunnel,
  };
}

/** Inverse of toConfig — hydrates the wizard from a saved WinBridgeConfig. */
export function fromConfig(cfg: WinBridgeConfig): FormState {
  return {
    host: cfg.host,
    port: String(cfg.port),
    endpointPath: cfg.endpointPath,
    token: cfg.token,
    allowedOrigins: cfg.allowedOrigins.join(", "),
    screenshotEnabled: cfg.screenshot.enabled,
    screenshotRoles: cfg.screenshot.roles.join(", "),
    retentionHours: String(cfg.screenshot.retentionHours),
    fileEnabled: cfg.fileTransfer.enabled,
    fileRoot: cfg.fileTransfer.root,
    maxBytesMB: String(cfg.fileTransfer.maxBytesMB),
    allow: cfg.policy.allow.join("\n"),
    deny: cfg.policy.deny.join("\n"),
    certPath: cfg.tls.certPath,
    keyPath: cfg.tls.keyPath,
    clientCaPath: cfg.tls.clientCaPath,
    allowedIps: cfg.allowedIps.join("\n"),
    tunnel: cfg.tunnel,
  };
}

/** Deep-merge unknown JSON onto DEFAULT_CONFIG, keeping only known fields. */
export function sanitizeConfig(raw: unknown): WinBridgeConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const str = (v: unknown, fb: string) => (typeof v === "string" ? v : fb);
  const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fb;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const d = DEFAULT_CONFIG;
  const shot = obj(r.screenshot);
  const file = obj(r.fileTransfer);
  const policy = obj(r.policy);
  const tls = obj(r.tls);

  return {
    host: str(r.host, d.host).trim() || d.host,
    port: num(r.port, d.port),
    endpointPath: str(r.endpointPath, d.endpointPath).trim() || d.endpointPath,
    token: str(r.token, d.token),
    allowedOrigins: list(r.allowedOrigins),
    screenshot: {
      enabled: bool(shot.enabled, d.screenshot.enabled),
      roles: list(shot.roles),
      retentionHours: num(shot.retentionHours, d.screenshot.retentionHours),
    },
    fileTransfer: {
      enabled: bool(file.enabled, d.fileTransfer.enabled),
      root: str(file.root, d.fileTransfer.root),
      maxBytesMB: num(file.maxBytesMB, d.fileTransfer.maxBytesMB),
    },
    policy: { allow: list(policy.allow), deny: list(policy.deny) },
    tls: {
      certPath: str(tls.certPath, d.tls.certPath),
      keyPath: str(tls.keyPath, d.tls.keyPath),
      clientCaPath: str(tls.clientCaPath, d.tls.clientCaPath),
    },
    allowedIps: list(r.allowedIps),
    tunnel: bool(r.tunnel, d.tunnel),
  };
}
