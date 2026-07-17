// Server-only persistence for the chosen database backend.
//
// Stored at data/winreach-db.json next to the app (this app runs on the
// Windows host itself). The connection string / URL is ENCRYPTED at rest with
// encryptAtRest() (AES-256-GCM, key from WINREACH_DB_KEY); the SQLite file path
// is not a secret and is stored in the clear. A live AccountStore is built from
// the persisted config on demand and cached for reuse.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { AccountStore, StoreConfig, StoreKind } from "@/lib/store/types";
import { createStore } from "@/lib/store/index";
import { decryptAtRest, encryptAtRest, encryptionAvailable } from "@/lib/store/crypto";

/** On-disk shape. `urlEnc` holds the AES-GCM ciphertext of the connection URL. */
type StoredDbConfig = {
  kind: StoreKind;
  /** SQLite only — file path (not a secret). */
  file?: string;
  /** Non-SQLite — encrypted connection URL. */
  urlEnc?: string;
  /** MongoDB only — optional database name. */
  database?: string;
  updatedAt: string;
};

export type DbConfigMeta = {
  kind: StoreKind;
  /** SQLite file path, if applicable. */
  file?: string;
  database?: string;
  updatedAt: string;
};

function storePath(): string {
  return path.join(process.cwd(), "data", "winreach-db.json");
}

/** Encryption is required for any backend whose config contains a secret URL. */
export function requiresEncryption(kind: StoreKind): boolean {
  return kind !== "sqlite";
}

async function readRaw(): Promise<StoredDbConfig | null> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    return JSON.parse(raw) as StoredDbConfig;
  } catch {
    return null;
  }
}

/** Persist a chosen config, encrypting the URL for non-SQLite backends. */
export async function writeDbConfig(config: StoreConfig): Promise<void> {
  const doc: StoredDbConfig = { kind: config.kind, updatedAt: new Date().toISOString() };
  if (config.kind === "sqlite") {
    doc.file = config.file;
  } else {
    if (!encryptionAvailable()) {
      throw new Error(
        "WINREACH_DB_KEY is not set. It is required to encrypt the connection string at rest for non-SQLite backends.",
      );
    }
    doc.urlEnc = encryptAtRest(config.url);
    if (config.kind === "mongodb" && config.database) doc.database = config.database;
  }
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  await closeStore();
}

/** The decrypted StoreConfig, or null if none is persisted. */
export async function readDbConfig(): Promise<StoreConfig | null> {
  const doc = await readRaw();
  if (!doc) return null;
  if (doc.kind === "sqlite") {
    return { kind: "sqlite", file: doc.file ?? "data/winreach.sqlite" };
  }
  if (!doc.urlEnc) return null;
  const url = decryptAtRest(doc.urlEnc); // throws if WINREACH_DB_KEY is wrong/missing
  if (doc.kind === "mongodb") return { kind: "mongodb", url, database: doc.database };
  return { kind: doc.kind, url };
}

/** Lightweight metadata (no secrets) about the persisted config, or null. */
export async function readDbConfigMeta(): Promise<DbConfigMeta | null> {
  const doc = await readRaw();
  if (!doc) return null;
  return { kind: doc.kind, file: doc.file, database: doc.database, updatedAt: doc.updatedAt };
}

/* --------------------------- live store (cached) -------------------------- */

let cached: { key: string; store: AccountStore } | null = null;

function keyOf(config: StoreConfig): string {
  return JSON.stringify(config);
}

/** Build (or reuse) a live AccountStore from the persisted config, or null. */
export async function getStore(): Promise<AccountStore | null> {
  const config = await readDbConfig();
  if (!config) return null;
  const key = keyOf(config);
  if (cached && cached.key === key) return cached.store;
  if (cached) {
    await cached.store.close().catch(() => {});
    cached = null;
  }
  const store = createStore(config);
  cached = { key, store };
  return store;
}

/** Drop the cached store (call after the persisted config changes). */
export async function closeStore(): Promise<void> {
  if (cached) {
    await cached.store.close().catch(() => {});
    cached = null;
  }
}
