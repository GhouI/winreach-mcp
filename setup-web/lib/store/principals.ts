// Build the WINBRIDGE_PRINCIPALS JSON from stored account users. Mirrors the
// shape of buildPrincipalsJson() in lib/winbridge-config.ts, but emits each
// entry's `tokenHash` (SHA-256 of the bearer token) instead of a plaintext
// token — the WinBridge server authenticates by hashing the presented token and
// comparing it to this value. Only enabled users are exported.

import type { AccountUser } from "@/lib/store/types";

export function buildPrincipalsFromUsers(users: AccountUser[]): string {
  const entries = users
    .filter((u) => u.enabled)
    .map((u) => {
      const entry: Record<string, unknown> = {
        name: u.name.trim() || "user",
        role: u.role || "user",
        tokenHash: u.tokenHash,
      };
      if (u.allow.length) entry.allow = u.allow;
      if (u.deny.length) entry.deny = u.deny;
      // `tools: null` means all tools — omit the field entirely, as the wizard does.
      if (u.tools !== null) entry.tools = u.tools;
      return entry;
    });
  return JSON.stringify(entries, null, 2);
}
