// MySQL backend using `mysql2/promise` (loaded via dynamic import). Follows
// docs/database.md: additive init, validate-don't-mutate, parameterized (?)
// queries only, JSON arrays stored in JSON columns, enabled as TINYINT(1).

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
type MysqlConn = {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
  execute(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
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
    enabled: Number(row.enabled) !== 0,
    createdAt: toIso(row.created_at),
    lastUsedAt: toIsoOrNull(row.last_used_at),
  };
}

const USER_UPDATE: Record<string, { col: string; ser: (v: unknown) => unknown }> = {
  name: { col: "name", ser: (v) => String(v) },
  role: { col: "role", ser: (v) => String(v) },
  tokenHash: { col: "token_hash", ser: (v) => String(v) },
  tokenEnc: { col: "token_enc", ser: (v) => (v == null ? null : String(v)) },
  tools: { col: "tools", ser: (v) => (v == null ? null : JSON.stringify(v)) },
  allow: { col: "allow", ser: (v) => JSON.stringify(v ?? []) },
  deny: { col: "deny", ser: (v) => JSON.stringify(v ?? []) },
  enabled: { col: "enabled", ser: (v) => (v ? 1 : 0) },
  lastUsedAt: { col: "last_used_at", ser: (v) => (v == null ? null : String(v)) },
};

/** MySQL DATETIME literal (UTC) from an ISO string; connection uses timezone 'Z'. */
function toDbTime(iso: string): string {
  // "2026-07-16T12:34:56.789Z" -> "2026-07-16 12:34:56.789"
  return new Date(iso).toISOString().slice(0, 23).replace("T", " ");
}

export class MysqlStore implements AccountStore {
  readonly kind = "mysql" as const;
  private conn: MysqlConn | null = null;
  constructor(private readonly url: string) {}

  private async connect(): Promise<MysqlConn> {
    if (this.conn) return this.conn;
    const mysql = (await import("mysql2/promise")) as unknown as {
      createConnection(config: { uri: string; timezone: string }): Promise<MysqlConn>;
    };
    this.conn = await mysql.createConnection({ uri: this.url, timezone: "Z" });
    return this.conn;
  }

  private async rows(sql: string, values?: unknown[]): Promise<Row[]> {
    const c = await this.connect();
    const [res] = await c.execute(sql, values);
    return (res as Row[]) ?? [];
  }

  private async tableExists(name: string): Promise<boolean> {
    const rows = await this.rows(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [name],
    );
    return rows.length > 0;
  }

  private async columns(table: string): Promise<string[]> {
    const rows = await this.rows(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ?",
      [table],
    );
    return rows.map((r) => String(r.column_name ?? r.COLUMN_NAME));
  }

  async init(): Promise<StoreStatus> {
    const c = await this.connect();
    let created = false;
    const missing: string[] = [];

    if (!(await this.tableExists("winbridge_admins"))) {
      await c.query(`CREATE TABLE IF NOT EXISTS winbridge_admins (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME(3) NOT NULL
      )`);
      created = true;
    } else {
      missing.push(...missingFields(await this.columns("winbridge_admins"), REQUIRED_ADMIN_FIELDS));
    }

    if (!(await this.tableExists("winbridge_users"))) {
      await c.query(`CREATE TABLE IF NOT EXISTS winbridge_users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(255) NOT NULL,
        token_hash VARCHAR(255) UNIQUE NOT NULL,
        token_enc TEXT NULL,
        tools JSON NULL,
        allow JSON NOT NULL,
        deny JSON NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        last_used_at DATETIME(3) NULL
      )`);
      created = true;
    } else {
      missing.push(...missingFields(await this.columns("winbridge_users"), REQUIRED_USER_FIELDS));
    }

    await c.query(`CREATE TABLE IF NOT EXISTS winbridge_meta (
      \`key\` VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    await c.query(
      "INSERT INTO winbridge_meta (`key`, value) VALUES ('schema_version', ?) " +
        "ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [String(SCHEMA_VERSION)],
    );

    const schemaReady = missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created,
      missing,
      schemaVersion: await this.readVersion(),
      detail: schemaReady
        ? undefined
        : `Existing table is missing required column(s): ${missing.join(", ")}.`,
    };
  }

  private async readVersion(): Promise<number | undefined> {
    try {
      const rows = await this.rows("SELECT value FROM winbridge_meta WHERE `key` = 'schema_version'");
      return rows[0] ? Number(rows[0].value) : undefined;
    } catch {
      return undefined;
    }
  }

  async status(): Promise<StoreStatus> {
    await this.connect();
    const missing: string[] = [];
    const adminsExist = await this.tableExists("winbridge_admins");
    const usersExist = await this.tableExists("winbridge_users");
    if (!adminsExist) missing.push("winbridge_admins");
    else missing.push(...missingFields(await this.columns("winbridge_admins"), REQUIRED_ADMIN_FIELDS));
    if (!usersExist) missing.push("winbridge_users");
    else missing.push(...missingFields(await this.columns("winbridge_users"), REQUIRED_USER_FIELDS));
    const schemaReady = adminsExist && usersExist && missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created: false,
      missing,
      schemaVersion: await this.readVersion(),
      detail: schemaReady ? undefined : "Run setup to create/validate the schema.",
    };
  }

  async close(): Promise<void> {
    if (this.conn) {
      await this.conn.end();
      this.conn = null;
    }
  }

  async countAdmins(): Promise<number> {
    const rows = await this.rows("SELECT COUNT(*) AS n FROM winbridge_admins");
    return Number(rows[0].n);
  }

  async createAdmin(username: string, passwordHash: string): Promise<AdminAccount> {
    const c = await this.connect();
    const admin: AdminAccount = { id: newId(), username, passwordHash, createdAt: nowIso() };
    await c.execute(
      "INSERT INTO winbridge_admins (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
      [admin.id, admin.username, admin.passwordHash, toDbTime(admin.createdAt)],
    );
    return admin;
  }

  async getAdminByUsername(username: string): Promise<AdminAccount | null> {
    const rows = await this.rows("SELECT * FROM winbridge_admins WHERE username = ?", [username]);
    return rows[0] ? mapAdmin(rows[0]) : null;
  }

  async getAdminById(id: string): Promise<AdminAccount | null> {
    const rows = await this.rows("SELECT * FROM winbridge_admins WHERE id = ?", [id]);
    return rows[0] ? mapAdmin(rows[0]) : null;
  }

  async listUsers(): Promise<AccountUser[]> {
    const rows = await this.rows("SELECT * FROM winbridge_users ORDER BY created_at ASC");
    return rows.map(mapUser);
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const rows = await this.rows("SELECT * FROM winbridge_users WHERE id = ?", [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<AccountUser | null> {
    const rows = await this.rows("SELECT * FROM winbridge_users WHERE token_hash = ?", [tokenHash]);
    return rows[0] ? mapUser(rows[0]) : null;
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
    await c.execute(
      `INSERT INTO winbridge_users
        (id, name, role, token_hash, token_enc, tools, allow, deny, enabled, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.name,
        user.role,
        user.tokenHash,
        user.tokenEnc,
        user.tools === null ? null : JSON.stringify(user.tools),
        JSON.stringify(user.allow),
        JSON.stringify(user.deny),
        user.enabled ? 1 : 0,
        toDbTime(user.createdAt),
        null,
      ],
    );
    return user;
  }

  async updateUser(id: string, patch: UserPatch): Promise<AccountUser | null> {
    const c = await this.connect();
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, spec] of Object.entries(USER_UPDATE)) {
      if (key in patch) {
        const raw = (patch as Record<string, unknown>)[key];
        sets.push(`${spec.col} = ?`);
        values.push(
          spec.col === "last_used_at" && raw != null ? toDbTime(String(raw)) : spec.ser(raw),
        );
      }
    }
    if (sets.length > 0) {
      values.push(id);
      await c.execute(`UPDATE winbridge_users SET ${sets.join(", ")} WHERE id = ?`, values);
    }
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const c = await this.connect();
    const [res] = await c.execute("DELETE FROM winbridge_users WHERE id = ?", [id]);
    const affected = (res as { affectedRows?: number }).affectedRows ?? 0;
    return affected > 0;
  }

  async touchUser(id: string, whenIso: string): Promise<void> {
    const c = await this.connect();
    await c.execute("UPDATE winbridge_users SET last_used_at = ? WHERE id = ?", [
      toDbTime(whenIso),
      id,
    ]);
  }
}
