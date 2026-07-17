// MongoDB backend using `mongodb` (loaded via dynamic import). Documents use
// camelCase fields mirroring AccountUser/AdminAccount; native arrays for
// tools/allow/deny (tools: null = all tools). Follows docs/database.md:
// additive init (create collections + unique indexes), validate an existing
// collection's documents (never mutate), filters built from bound values only.

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
import { newId, nowIso, snakeToCamel } from "@/lib/store/shared";

type Doc = Record<string, unknown>;
type Collection = {
  countDocuments(filter?: Doc): Promise<number>;
  findOne(filter: Doc): Promise<Doc | null>;
  find(filter: Doc): { sort(s: Doc): { toArray(): Promise<Doc[]> } };
  insertOne(doc: Doc): Promise<unknown>;
  updateOne(filter: Doc, update: Doc, options?: Doc): Promise<{ matchedCount: number }>;
  deleteOne(filter: Doc): Promise<{ deletedCount: number }>;
  createIndex(spec: Doc, options?: Doc): Promise<string>;
};
type Db = {
  collection(name: string): Collection;
  listCollections(filter?: Doc): { toArray(): Promise<{ name: string }[]> };
};
type MongoClientT = { connect(): Promise<void>; db(name?: string): Db; close(): Promise<void> };

const ADMINS = "winreach_admins";
const USERS = "winreach_users";
const META = "winreach_meta";

/** Required snake_case field -> camelCase document key. */
const camelOf = (f: string): string => snakeToCamel(f);

function mapAdmin(doc: Doc): AdminAccount {
  return {
    id: String(doc.id),
    username: String(doc.username),
    passwordHash: String(doc.passwordHash),
    createdAt: String(doc.createdAt),
  };
}

function mapUser(doc: Doc): AccountUser {
  return {
    id: String(doc.id),
    name: String(doc.name),
    role: String(doc.role),
    tokenHash: String(doc.tokenHash),
    tokenEnc: doc.tokenEnc == null ? null : String(doc.tokenEnc),
    tools: Array.isArray(doc.tools) ? (doc.tools as string[]) : null,
    allow: Array.isArray(doc.allow) ? (doc.allow as string[]) : [],
    deny: Array.isArray(doc.deny) ? (doc.deny as string[]) : [],
    enabled: Boolean(doc.enabled),
    createdAt: String(doc.createdAt),
    lastUsedAt: doc.lastUsedAt == null ? null : String(doc.lastUsedAt),
  };
}

/** Whitelisted patch keys (camelCase) that may be written to a user document. */
const USER_PATCH_KEYS = new Set([
  "name",
  "role",
  "tokenHash",
  "tokenEnc",
  "tools",
  "allow",
  "deny",
  "enabled",
  "lastUsedAt",
]);

export class MongodbStore implements AccountStore {
  readonly kind = "mongodb" as const;
  private client: MongoClientT | null = null;
  private dbHandle: Db | null = null;
  constructor(
    private readonly url: string,
    private readonly database?: string,
  ) {}

  private async connect(): Promise<Db> {
    if (this.dbHandle) return this.dbHandle;
    const mongo = (await import("mongodb")) as unknown as {
      MongoClient: new (url: string) => MongoClientT;
    };
    const client = new mongo.MongoClient(this.url);
    await client.connect();
    this.client = client;
    this.dbHandle = this.database ? client.db(this.database) : client.db();
    return this.dbHandle;
  }

  private async collectionNames(db: Db): Promise<Set<string>> {
    const list = await db.listCollections().toArray();
    return new Set(list.map((c) => c.name));
  }

  /** Missing required fields judged from a sample document (empty = ready). */
  private async validate(db: Db, name: string, required: readonly string[]): Promise<string[]> {
    const sample = await db.collection(name).findOne({});
    if (!sample) return []; // empty collection: nothing to validate against yet
    return required.filter((f) => !(camelOf(f) in sample));
  }

  async init(): Promise<StoreStatus> {
    const db = await this.connect();
    const existing = await this.collectionNames(db);
    let created = false;
    const missing: string[] = [];

    if (!existing.has(ADMINS)) created = true;
    else missing.push(...(await this.validate(db, ADMINS, REQUIRED_ADMIN_FIELDS)));

    if (!existing.has(USERS)) created = true;
    else missing.push(...(await this.validate(db, USERS, REQUIRED_USER_FIELDS)));

    // Indexes are idempotent; only enforce uniqueness when it can't conflict
    // with pre-existing duplicate data (i.e. when we're creating fresh).
    try {
      await db.collection(ADMINS).createIndex({ username: 1 }, { unique: true });
      await db.collection(USERS).createIndex({ name: 1 }, { unique: true });
      await db.collection(USERS).createIndex({ tokenHash: 1 }, { unique: true });
    } catch (err) {
      if (missing.length === 0) {
        return {
          connected: true,
          schemaReady: false,
          created,
          missing,
          detail: `Could not create required unique indexes: ${(err as Error).message}`,
        };
      }
    }

    await db
      .collection(META)
      .updateOne(
        { key: "schema_version" },
        { $set: { key: "schema_version", value: String(SCHEMA_VERSION) } },
        { upsert: true },
      );

    const schemaReady = missing.length === 0;
    return {
      connected: true,
      schemaReady,
      created,
      missing,
      schemaVersion: SCHEMA_VERSION,
      detail: schemaReady
        ? undefined
        : `Existing collection documents are missing required field(s): ${missing.join(", ")}.`,
    };
  }

  async status(): Promise<StoreStatus> {
    const db = await this.connect();
    const existing = await this.collectionNames(db);
    const missing: string[] = [];
    const adminsExist = existing.has(ADMINS);
    const usersExist = existing.has(USERS);
    if (adminsExist) missing.push(...(await this.validate(db, ADMINS, REQUIRED_ADMIN_FIELDS)));
    if (usersExist) missing.push(...(await this.validate(db, USERS, REQUIRED_USER_FIELDS)));
    // Collections are created lazily on first insert; treat absent-but-connected
    // as "ready to be created" only after init(). Here, require both present.
    const schemaReady = adminsExist && usersExist && missing.length === 0;
    let schemaVersion: number | undefined;
    try {
      const meta = await db.collection(META).findOne({ key: "schema_version" });
      schemaVersion = meta ? Number(meta.value) : undefined;
    } catch {
      schemaVersion = undefined;
    }
    return {
      connected: true,
      schemaReady,
      created: false,
      missing,
      schemaVersion,
      detail: schemaReady ? undefined : "Run setup to create/validate the collections.",
    };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.dbHandle = null;
    }
  }

  async countAdmins(): Promise<number> {
    const db = await this.connect();
    return db.collection(ADMINS).countDocuments();
  }

  async createAdmin(username: string, passwordHash: string): Promise<AdminAccount> {
    const db = await this.connect();
    const admin: AdminAccount = { id: newId(), username, passwordHash, createdAt: nowIso() };
    await db.collection(ADMINS).insertOne({
      _id: admin.id as unknown as Doc[string],
      id: admin.id,
      username: admin.username,
      passwordHash: admin.passwordHash,
      createdAt: admin.createdAt,
    });
    return admin;
  }

  async getAdminByUsername(username: string): Promise<AdminAccount | null> {
    const db = await this.connect();
    const doc = await db.collection(ADMINS).findOne({ username });
    return doc ? mapAdmin(doc) : null;
  }

  async getAdminById(id: string): Promise<AdminAccount | null> {
    const db = await this.connect();
    const doc = await db.collection(ADMINS).findOne({ id });
    return doc ? mapAdmin(doc) : null;
  }

  async listUsers(): Promise<AccountUser[]> {
    const db = await this.connect();
    const docs = await db.collection(USERS).find({}).sort({ createdAt: 1 }).toArray();
    return docs.map(mapUser);
  }

  async getUserById(id: string): Promise<AccountUser | null> {
    const db = await this.connect();
    const doc = await db.collection(USERS).findOne({ id });
    return doc ? mapUser(doc) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<AccountUser | null> {
    const db = await this.connect();
    const doc = await db.collection(USERS).findOne({ tokenHash });
    return doc ? mapUser(doc) : null;
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
    await db.collection(USERS).insertOne({
      _id: user.id as unknown as Doc[string],
      id: user.id,
      name: user.name,
      role: user.role,
      tokenHash: user.tokenHash,
      tokenEnc: user.tokenEnc,
      tools: user.tools,
      allow: user.allow,
      deny: user.deny,
      enabled: user.enabled,
      createdAt: user.createdAt,
      lastUsedAt: user.lastUsedAt,
    });
    return user;
  }

  async updateUser(id: string, patch: UserPatch): Promise<AccountUser | null> {
    const db = await this.connect();
    const set: Doc = {};
    for (const [key, value] of Object.entries(patch)) {
      if (USER_PATCH_KEYS.has(key)) set[key] = value;
    }
    if (Object.keys(set).length > 0) {
      await db.collection(USERS).updateOne({ id }, { $set: set });
    }
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await this.connect();
    const res = await db.collection(USERS).deleteOne({ id });
    return res.deletedCount > 0;
  }

  async touchUser(id: string, whenIso: string): Promise<void> {
    const db = await this.connect();
    await db.collection(USERS).updateOne({ id }, { $set: { lastUsedAt: whenIso } });
  }
}
