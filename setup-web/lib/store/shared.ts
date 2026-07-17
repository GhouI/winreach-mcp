// Small helpers shared by the store backends. Server-only (node:crypto).

import { randomUUID } from "node:crypto";
import { REQUIRED_USER_FIELDS, REQUIRED_ADMIN_FIELDS } from "@/lib/store/types";

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => randomUUID();

/** snake_case -> camelCase (e.g. token_hash -> tokenHash). */
export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** Required columns that are absent from the set the target actually has. */
export function missingFields(present: Iterable<string>, required: readonly string[]): string[] {
  const have = new Set(present);
  return required.filter((f) => !have.has(f));
}

export { REQUIRED_USER_FIELDS, REQUIRED_ADMIN_FIELDS };

/** Coerce a stored JSON array (string, array, or null) into string[]. */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Coerce a stored `tools` value into string[] | null (null = all tools). */
export function toToolsArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    if (!value.trim()) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed === null) return null;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Normalize a DB timestamp (Date | string) to an ISO string. */
export function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}

/** Normalize an optional DB timestamp to ISO string | null. */
export function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return toIso(value);
}
