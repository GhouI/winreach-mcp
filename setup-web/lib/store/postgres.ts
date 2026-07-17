// PostgreSQL backend using `pg` (loaded via dynamic import so it isn't bundled
// unless used). Follows docs/database.md: additive init, validate-don't-mutate,
// parameterized ($1,$2) queries only, JSON arrays stored as JSONB.

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

type Row = Record<string, unknown>;
type PgClient = {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  end(): Promise<void>;
};

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
    enabled: Boolean(row.enabled),
    createdAt: toIso(row.created_at),
    lastUsedAt: toIsoOrNull(row.last_used_at),
  };
}

const USER_UPDATE: Record<string, { col: string; cast: string; ser: (v: unknown) => unknown }> = {
  name: { col: "name", cast: "", ser: (v) => String(v) },
  role: { col: "role", cast: "", ser: (v) => String(v) },
  tokenHash: { col: "token_hash", cast: "", ser: (v) => String(v) },
  tokenEnc: { col: "token_enc", cast: "", ser: (v) => (v == null ? null : String(v)) },
  tools: { col: "tools", cast: "::jsonb", ser: (v) => (v == null ? null : JSON.stringify(v)) },
  allow: { col: "allow", cast: "::jsonb", ser: (v) => JSON.stringify(v ?? []) },
  deny: { col: "deny", cast: "::jsonb", ser: (v) => JSON.stringify(v ?? []) },
  enabled: { col: "enabled", cast: "", ser: (v) => Boolean(v) },
  lastUsedAt: { col: "last_used_at", cast: "", ser: (v) => (v == null ? null : String(v)) },
};

export class PostgresStore implements AccountStore {
  readonly kind = "postgres" as const;
  private client: PgClient | null = null;
  constructor(private readonly url: string) {}

  private async connect(): Promise<PgClient> {
    if (this.client) return this.client;
    const pg = (await import("pg")).default as unknown as {
      Client: new (config: { connectionString: string }) => PgClient;
    };
    const client = new pg.Client({ connectionString: this.url });
    await client.connect();
    this.client = client;
    return client;
  }

  private async tableExists(c: PgClient, name: string): Promise<boolean> {
    const res = await c.query("SELECT to_regclass($1) AS reg", [name]);
    return res.rows[0]?.reg != null;
  }

  private async columns(c: PgClient, table: string): Promise<string[]> {
    const res = await c.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
      [table],
    );
    return res.rows.map((r) => String(r.column_name));
  }

  async init(): Promise<StoreStatus> {
    const c = await this.connect();
    let created = false;
    const missing: string[] = [];

    if (!(await this.tableExists(c, "winreach_admins"))) {
      await c.query(`CREATE TABLE IF NOT EXISTS winreach_admins (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      )`);
      created = true;
    } else {
      missing.push(...missingFields(await this.columns(c, "winreach_admins"), REQUIRED_ADMIN_FIELDS));
    }

    if (!(await this.tableExists(c, "winreach_users"))) {
      await c.query(`CREATE TABLE IF NOT EXISTS winreach_users (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        token_enc TEXT,
        tools JSONB,
        allow JSONB NOT NULL DEFAULT '[]'::jsonb,
        deny JSONB NOT NULL DEFAULT '[]'::jsonb,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL,
        last_used_at TIMESTAMPTZ
      )`);
      created = true;
    } else {
      missing.push(...missingFields(await this.columns(c, "winreach_users"), REQUIRED_USER_FIELDS));
    }

    await c.query(`CREATE TABLE IF NOT EXISTS winreach_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    await c.query(
      "INSERT INTO winreach_meta (key, value) VALUES ('schema_version', $1) " +
        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [String(SCHEMA_VERSION)],
    );

    const schemaReady = missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created,
      missing,
      schemaVersion: await this.readVersion(c),
      detail: schemaReady
        ? undefined
        : `Existing table is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  private async readVersion(c: PgClient): Promise<number | undefined> {
    try {
      const res = await c.query("SELECT value FROM winreach_meta WHERE key = 'schema_version'");
      return res.rows[0] ? Number(res.rows[0].value) : undefined;
    } catch {
      return undefined;
    }
  }

  async status(): Promise<StoreStatus> {
    const c = await this.connect();
    const missing: string[] = [];
    const adminsExist = await this.tableExists(c, "winreach_admins");
    const usersExist = await this.tableExists(c, "winreach_users");
    if (!adminsExist) missing.push("winreach_admins");
    else missing.push(...missingFields(await this.columns(c, "winreach_admins"), REQUIRED_ADMIN_FIELDS));
    if (!usersExist) missing.push("winreach_users");
    else missing.push(...missingFields(await this.columns(c, "winreach_users"), REQUIRED_USER_FIELDS));
    const schemaReady = adminsExist && usersExist && missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created: false,
      missing,
      schemaVersion: await this.readVersion(c),
      detail: schemaReady ? undefined : "Run setup to create/validate the schema.",
    };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  async countAdmins(): Promise<number> {
    const c = await this.connect();
    const res = await c.query("SELECT COUNT(*)::int AS n FROM winreach_admins");
    return Number(res.rows[0].n);
  }

  async createAdmin(username: string, passwordHash: string): Promise<AdminAccount> {
    const c = await this.connect();
    const admin: AdminAccount = { id: newId(), username, passwordHash, createdAt: nowIso() };
    await c.query(
      "INSERT INTO winreach_admins (id, username, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      [admin.id, admin.username, admin.passwordHash, admin.createdAt],
    );
    return admin;
  }

  async getAdminByUsername(username: string): Promise<AdminAccount | null> {
    const c = await this.connect();
    const res = await c.query("SELECT * FROM winreach_admins WHERE username = $1", [username]);
    return res.rows[0] ? mapAdmin(res.rows[0]) : null;
  }

  async getAdminById(id: string): Promise<AdminAccount | null> {
    const c = await this.connect();
    const res = await c.query("SELECT * FROM winreach_admins WHERE id = $1", [id]);
    return res.rows[0] ? mapAdmin(res.rows[0]) : null;
  }

  async listUsers(): Promise<AccountUser[]> {
    const c = await this.connect();
    const res = await c.query("SELECT * FROM winreach_users ORDER BY created_at ASC");
    return res.rows.map(mapUser);
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const c = await this.connect();
    const res = await c.query("SELECT * FROM winreach_users WHERE id = $1", [id]);
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<AccountUser | null> {
    const c = await this.connect();
    const res = await c.query("SELECT * FROM winreach_users WHERE token_hash = $1", [tokenHash]);
    return res.rows[0] ? mapUser(res.rows[0]) : null;
  }

  async createUser(input: NewUserInput): Promise<AccountUser> {
    const c = await this.connect();
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
    await c.query(
      `INSERT INTO winreach_users
        (id, name, role, token_hash, token_enc, tools, allow, deny, enabled, created_at, last_used_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11)`,
      [
        user.id,
        user.name,
        user.role,
        user.tokenHash,
        user.tokenEnc,
        user.tools === null ? null : JSON.stringify(user.tools),
        JSON.stringify(user.allow),
        JSON.stringify(user.deny),
        user.enabled,
        user.createdAt,
        user.lastUsedAt,
      ],
    );
    return user;
  }

  async updateUser(id: string, patch: UserPatch): Promise<AccountUser | null> {
    const c = await this.connect();
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, spec] of Object.entries(USER_UPDATE)) {
      if (key in patch) {
        sets.push(`${spec.col} = $${i}${spec.cast}`);
        values.push(spec.ser((patch as Record<string, unknown>)[key]));
        i++;
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await c.query(`UPDATE winreach_users SET ${sets.join(", ")} WHERE id = $${i}`, values);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const c = await this.connect();
    const res = await c.query("DELETE FROM winreach_users WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async touchUser(id: string, whenIso: string): Promise<void> {
    const c = await this.connect();
    await c.query("UPDATE winreach_users SET last_used_at = $1 WHERE id = $2", [whenIso, id]);
  }
}
