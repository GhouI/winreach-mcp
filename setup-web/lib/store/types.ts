// The database-agnostic account store. Every backend (SQLite, Postgres, MySQL,
// MongoDB, ...) implements this same interface, so the app never depends on a
// specific engine. See docs/database.md for the canonical schema and for how a
// future agent can add a backend or extend the schema safely.

/** A web-admin login account. */
export type AdminAccount = {
  id: string;
  username: string;
  /** scrypt hash from lib/store/crypto.ts — never plaintext. */
  passwordHash: string;
  createdAt: string; // ISO
};

/** A principal / agent key (becomes one WINBRIDGE_PRINCIPALS entry). */
export type AccountUser = {
  id: string;
  name: string;
  role: string;
  /** SHA-256 hash of the bearer token (for auth). Plaintext is never stored. */
  tokenHash: string;
  /** AES-GCM-encrypted copy of the token so an operator can re-reveal it, or null. */
  tokenEnc: string | null;
  /** Tool allowlist. `null` = every tool (omit `tools` when exporting principals). */
  tools: string[] | null;
  allow: string[];
  deny: string[];
  enabled: boolean;
  createdAt: string; // ISO
  lastUsedAt: string | null;
};

/** Fields accepted when creating a user (server fills id/hashes/timestamps). */
export type NewUserInput = {
  name: string;
  role: string;
  tokenHash: string;
  tokenEnc: string | null;
  tools: string[] | null;
  allow: string[];
  deny: string[];
  enabled?: boolean;
};

export type UserPatch = Partial<Omit<AccountUser, "id" | "createdAt">>;

export type StoreKind = "sqlite" | "postgres" | "mysql" | "mongodb";

export type StoreConfig =
  | { kind: "sqlite"; file: string }
  | { kind: "postgres" | "mysql"; url: string }
  | { kind: "mongodb"; url: string; database?: string };

/** Result of inspecting a target database before use. */
export type StoreStatus = {
  connected: boolean;
  /** The store's tables/collections exist and match the required shape. */
  schemaReady: boolean;
  /** True when init() created missing tables/collections this run. */
  created: boolean;
  /** Any required column/field that an existing schema is missing. */
  missing: string[];
  /** Human-readable note (e.g. why schema is not ready). */
  detail?: string;
  schemaVersion?: number;
};

/**
 * A connected account store. Implementations MUST:
 *  - use parameterized queries only (never string-concatenate input),
 *  - be additive on init() — create what's missing, never DROP or destructively
 *    alter an existing schema,
 *  - treat unknown extra columns/fields as harmless (validate only the required
 *    ones), so operators can extend the schema for their own use.
 */
export interface AccountStore {
  readonly kind: StoreKind;

  /** Connect, create missing tables/collections, and validate the schema. */
  init(): Promise<StoreStatus>;
  /** Re-check connectivity + schema without mutating anything. */
  status(): Promise<StoreStatus>;
  close(): Promise<void>;

  // --- admins ---
  countAdmins(): Promise<number>;
  createAdmin(username: string, passwordHash: string): Promise<AdminAccount>;
  getAdminByUsername(username: string): Promise<AdminAccount | null>;
  getAdminById(id: string): Promise<AdminAccount | null>;

  // --- users / principals ---
  listUsers(): Promise<AccountUser[]>;
  getUserById(id: string): Promise<AccountUser | null>;
  getUserByTokenHash(tokenHash: string): Promise<AccountUser | null>;
  createUser(input: NewUserInput): Promise<AccountUser>;
  updateUser(id: string, patch: UserPatch): Promise<AccountUser | null>;
  deleteUser(id: string): Promise<boolean>;
  touchUser(id: string, whenIso: string): Promise<void>;
}

/** The columns/fields every backend must provide (used for schema validation). */
export const REQUIRED_USER_FIELDS = [
  "id",
  "name",
  "role",
  "token_hash",
  "token_enc",
  "tools",
  "allow",
  "deny",
  "enabled",
  "created_at",
  "last_used_at",
] as const;

export const REQUIRED_ADMIN_FIELDS = ["id", "username", "password_hash", "created_at"] as const;

/** Bump when the required schema changes; stored in winbridge_meta. */
export const SCHEMA_VERSION = 1;
