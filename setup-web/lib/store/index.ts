// Store factory. Given a StoreConfig, return the matching AccountStore.
//
// The adapter modules are lightweight; each loads its actual database driver
// (pg / mysql2 / mongodb / node:sqlite) lazily via dynamic import() inside its
// own connect(), so only the selected engine's driver is required at runtime.

import type { AccountStore, StoreConfig } from "@/lib/store/types";
import { SqliteStore } from "@/lib/store/sqlite";
import { PostgresStore } from "@/lib/store/postgres";
import { MysqlStore } from "@/lib/store/mysql";
import { MongodbStore } from "@/lib/store/mongodb";

export function createStore(config: StoreConfig): AccountStore {
  switch (config.kind) {
    case "sqlite":
      return new SqliteStore(config.file);
    case "postgres":
      return new PostgresStore(config.url);
    case "mysql":
      return new MysqlStore(config.url);
    case "mongodb":
      return new MongodbStore(config.url, config.database);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown store kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export type { AccountStore, StoreConfig } from "@/lib/store/types";
