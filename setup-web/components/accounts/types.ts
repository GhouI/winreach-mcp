import { ROLE_PRESETS, parseList } from "@/lib/winreach-config";

/** Bootstrap state reported by /api/auth/session. */
export type Boot = {
  dbConfigured: boolean;
  schemaReady: boolean;
  sessionSecret: boolean;
  adminExists: boolean;
  authenticated: boolean;
  admin?: { id: string; username: string };
  error?: string;
};

export type ApiUser = {
  id: string;
  name: string;
  role: string;
  tools: string[] | null;
  allow: string[];
  deny: string[];
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  tokenHash: string;
  hasEncryptedToken: boolean;
};

export const ROLES = ["admin", "operator", "readonly", "custom"];

export type Draft = {
  name: string;
  role: string;
  allTools: boolean;
  tools: string[];
  allow: string;
  deny: string;
  enabled: boolean;
};

export function emptyDraft(): Draft {
  const p = ROLE_PRESETS.admin;
  return { name: "", role: "admin", allTools: p.allTools, tools: [...p.tools], allow: "", deny: "", enabled: true };
}

export function draftFromUser(u: ApiUser): Draft {
  return {
    name: u.name,
    role: u.role,
    allTools: u.tools === null,
    tools: u.tools ?? [],
    allow: u.allow.join("\n"),
    deny: u.deny.join("\n"),
    enabled: u.enabled,
  };
}

export function draftToBody(d: Draft) {
  return {
    name: d.name.trim(),
    role: d.role,
    tools: d.allTools ? null : d.tools,
    allow: parseList(d.allow),
    deny: parseList(d.deny),
    enabled: d.enabled,
  };
}
