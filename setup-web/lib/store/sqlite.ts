// SQLite backend using Node's built-in `node:sqlite` (Node 22.5+, stable path
// on Node 24). No external driver. Synchronous API wrapped in async methods to
// satisfy the AccountStore interface.
//
// Follows docs/database.md: additive init (CREATE ... IF NOT EXISTS), validate
// (never ALTER/DROP) an existing schema, parameterized queries only, JSON arrays
// stored as TEXT, `tools` NULL = all tools.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  type AccountStore,
  type AccountUser,
  type AdminAccount,
  type NewUserInput,
  type StoreStatus,
  type UserPatch,
  REQUIRED_ADMIN_FIELDS,
  REQUIRED_USER_FIELDS,
  SCHEMA_VERSION,
} from "@/lib/store/types";
import { missingFields, newId, nowIso, toIso, toIsoOrNull, toStringArray, toToolsArray } from "@/lib/store/shared";

const UNAVAILABLE =
  "node:sqlite is unavailable in this runtime (requires Node 22.5+/24). " +
  "Use the Postgres, MySQL, or MongoDB backend instead.";

type Row = Record<string, unknown>;

function mapAdmin(row: Row): AdminAccount {
  return {
    id: String(row.id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    createdAt: toIso(row.created_at),
  };
}

function mapUser(row: Row): AccountUser {
  return {
    id: String(row.id),
    name: String(row.name),
    role: String(row.role),
    tokenHash: String(row.token_hash),
    tokenEnc: row.token_enc === null || row.token_enc === undefined ? null : String(row.token_enc),
    tools: toToolsArray(row.tools),
    allow: toStringArray(row.allow),
    deny: toStringArray(row.deny),
    enabled: Number(row.enabled) !== 0,
    createdAt: toIso(row.created_at),
    lastUsedAt: toIsoOrNull(row.last_used_at),
  };
}

/** Columns updatable via updateUser(), with their serializers. */
const USER_UPDATE: Record<string, { col: string; ser: (v: unknown) => unknown }> = {
  name: { col: "name", ser: (v) => String(v) },
  role: { col: "role", ser: (v) => String(v) },
  tokenHash: { col: "token_hash", ser: (v) => String(v) },
  tokenEnc: { col: "token_enc", ser: (v) => (v === null || v === undefined ? null : String(v)) },
  tools: { col: "tools", ser: (v) => (v === null || v === undefined ? null : JSON.stringify(v)) },
  allow: { col: "allow", ser: (v) => JSON.stringify(v ?? []) },
  deny: { col: "deny", ser: (v) => JSON.stringify(v ?? []) },
  enabled: { col: "enabled", ser: (v) => (v ? 1 : 0) },
  lastUsedAt: { col: "last_used_at", ser: (v) => (v === null || v === undefined ? null : String(v)) },
};

export class SqliteStore implements AccountStore {
  readonly kind = "sqlite" as const;
  private db: DatabaseSync | null = null;
  constructor(private readonly file: string) {}

  private async connect(): Promise<DatabaseSync> {
    if (this.db) return this.db;
    let DatabaseSyncCtor: typeof DatabaseSync;
    try {
      ({ DatabaseSync: DatabaseSyncCtor } = await import("node:sqlite"));
    } catch {
      throw new Error(UNAVAILABLE);
    }
    if (this.file !== ":memory:") {
      await fs.mkdir(path.dirname(path.resolve(this.file)), { recursive: true });
    }
    this.db = new DatabaseSyncCtor(this.file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    return this.db;
  }

  private tableExists(db: DatabaseSync, name: string): boolean {
    return Boolean(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name),
    );
  }

  private columns(db: DatabaseSync, table: string): string[] {
    return db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => String((r as Row).name));
  }

  async init(): Promise<StoreStatus> {
    const db = await this.connect();
    let created = false;
    const missing: string[] = [];

    if (!this.tableExists(db, "winbridge_admins")) {
      db.exec(`CREATE TABLE IF NOT EXISTS winbridge_admins (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`);
      created = true;
    } else {
      missing.push(...missingFields(this.columns(db, "winbridge_admins"), REQUIRED_ADMIN_FIELDS));
    }

    if (!this.tableExists(db, "winbridge_users")) {
      db.exec(`CREATE TABLE IF NOT EXISTS winbridge_users (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        token_enc TEXT,
        tools TEXT,
        allow TEXT NOT NULL DEFAULT '[]',
        deny TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        last_used_at TEXT
      )`);
      created = true;
    } else {
      missing.push(...missingFields(this.columns(db, "winbridge_users"), REQUIRED_USER_FIELDS));
    }

    db.exec(`CREATE TABLE IF NOT EXISTS winbridge_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    db.prepare(
      "INSERT INTO winbridge_meta (key, value) VALUES ('schema_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(String(SCHEMA_VERSION));

    const schemaReady = missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created,
      missing,
      schemaVersion: this.readVersion(db),
      detail: schemaReady
        ? undefined
        : `Existing table is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  private readVersion(db: DatabaseSync): number | undefined {
    try {
      const row = db.prepare("SELECT value FROM winbridge_meta WHERE key='schema_version'").get();
      return row ? Number((row as Row).value) : undefined;
    } catch {
      return undefined;
    }
  }

  async status(): Promise<StoreStatus> {
    const db = await this.connect();
    const missing: string[] = [];
    const adminsExist = this.tableExists(db, "winbridge_admins");
    const usersExist = this.tableExists(db, "winbridge_users");
    if (!adminsExist) missing.push("winbridge_admins");
    else missing.push(...missingFields(this.columns(db, "winbridge_admins"), REQUIRED_ADMIN_FIELDS));
    if (!usersExist) missing.push("winbridge_users");
    else missing.push(...missingFields(this.columns(db, "winbridge_users"), REQUIRED_USER_FIELDS));
    const schemaReady = adminsExist && usersExist && missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created: false,
      missing,
      schemaVersion: this.readVersion(db),
      detail: schemaReady ? undefined : "Run setup to create/validate the schema.",
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- admins ---
  async countAdmins(): Promise<number> {
    const db = await this.connect();
    const row = db.prepare("SELECT COUNT(*) AS n FROM winbridge_admins").get() as Row;
    return Number(row.n);
  }

  async createAdmin(username: string, passwordHash: string): Promise<AdminAccount> {
    const db = await this.connect();
    const admin: AdminAccount = { id: newId(), username, passwordHash, createdAt: nowIso() };
    db.prepare(
      "INSERT INTO winbridge_admins (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ).run(admin.id, admin.username, admin.passwordHash, admin.createdAt);
    return admin;
  }

  async getAdminByUsername(username: string): Promise<AdminAccount | null> {
    const db = await this.connect();
    const row = db.prepare("SELECT * FROM winbridge_admins WHERE username = ?").get(username);
    return row ? mapAdmin(row as Row) : null;
  }

  async getAdminById(id: string): Promise<AdminAccount | null> {
    const db = await this.connect();
    const row = db.prepare("SELECT * FROM winbridge_admins WHERE id = ?").get(id);
    return row ? mapAdmin(row as Row) : null;
  }

  // --- users ---
  async listUsers(): Promise<AccountUser[]> {
    const db = await this.connect();
    return db
      .prepare("SELECT * FROM winbridge_users ORDER BY created_at ASC")
      .all()
      .map((r) => mapUser(r as Row));
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const db = await this.connect();
    const row = db.prepare("SELECT * FROM winbridge_users WHERE id = ?").get(id);
    return row ? mapUser(row as Row) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<AccountUser | null> {
    const db = await this.connect();
    const row = db.prepare("SELECT * FROM winbridge_users WHERE token_hash = ?").get(tokenHash);
    return row ? mapUser(row as Row) : null;
  }

  async createUser(input: NewUserInput): Promise<AccountUser> {
    const db = await this.connect();
    const user: AccountUser = {
      id: newId(),
      name: input.name,
      role: input.role,
      tokenHash: input.tokenHash,
      tokenEnc: input.tokenEnc,
      tools: input.tools,
      allow: input.allow,
      deny: input.deny,
      enabled: input.enabled ?? true,
      createdAt: nowIso(),
      lastUsedAt: null,
    };
    db.prepare(
      `INSERT INTO winbridge_users
        (id, name, role, token_hash, token_enc, tools, allow, deny, enabled, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      user.id,
      user.name,
      user.role,
      user.tokenHash,
      user.tokenEnc,
      user.tools === null ? null : JSON.stringify(user.tools),
      JSON.stringify(user.allow),
      JSON.stringify(user.deny),
      user.enabled ? 1 : 0,
      user.createdAt,
      user.lastUsedAt,
    );
    return user;
  }

  async updateUser(id: string, patch: UserPatch): Promise<AccountUser | null> {
    const db = await this.connect();
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, spec] of Object.entries(USER_UPDATE)) {
      if (key in patch) {
        sets.push(`${spec.col} = ?`);
        values.push(spec.ser((patch as Record<string, unknown>)[key]));
      }
    }
    if (sets.length > 0) {
      values.push(id);
      db.prepare(`UPDATE winbridge_users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await this.connect();
    const res = db.prepare("DELETE FROM winbridge_users WHERE id = ?").run(id);
    return Number(res.changes) > 0;
  }

  async touchUser(id: string, whenIso: string): Promise<void> {
    const db = await this.connect();
    db.prepare("UPDATE winbridge_users SET last_used_at = ? WHERE id = ?").run(whenIso, id);
  }
}
