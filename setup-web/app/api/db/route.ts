// Database backend configuration endpoint (setup-key gated, like /api/config).
//
//   GET  /api/db  -> status of the persisted DB backend (connected? schemaReady?)
//   POST /api/db  { action: "test" | "setup", config } ->
//        test  = connect + report StoreStatus (no persistence)
//        setup = init (create/validate schema) + persist the encrypted config
//
// Auth: Authorization: Bearer <WINREACH_SETUP_KEY> (or x-setup-key header).

import { NextResponse, type NextRequest } from "next/server";
import { authorizeSetupKey } from "@/lib/setup-key";
import { clientKey, crossOriginError, rateLimit, rateLimited, readJsonCapped } from "@/lib/http-guard";
import { createStore } from "@/lib/store/index";
import {
  getStore,
  readDbConfigMeta,
  requiresEncryption,
  writeDbConfig,
} from "@/lib/store/db-config";
import { encryptionAvailable } from "@/lib/store/crypto";
import type { StoreConfig, StoreKind } from "@/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: StoreKind[] = ["sqlite", "postgres", "mysql", "mongodb"];

type ParseResult = { config: StoreConfig } | { error: string };

function parseConfig(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { error: "Missing config." };
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (typeof kind !== "string" || !KINDS.includes(kind as StoreKind)) {
    return { error: `config.kind must be one of: ${KINDS.join(", ")}.` };
  }
  if (kind === "sqlite") {
    const file = typeof r.file === "string" && r.file.trim() ? r.file.trim() : "data/winreach.sqlite";
    return { config: { kind: "sqlite", file } };
  }
  const url = typeof r.url === "string" ? r.url.trim() : "";
  if (!url) return { error: "config.url is required for this backend." };
  if (kind === "mongodb") {
    const database = typeof r.database === "string" && r.database.trim() ? r.database.trim() : undefined;
    return { config: { kind: "mongodb", url, database } };
  }
  return { config: { kind: kind as "postgres" | "mysql", url } };
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`setupkey:${clientKey(req)}`, 30, 5 * 60_000)) return rateLimited();
  const denied = authorizeSetupKey(req);
  if (denied) return denied;

  const meta = await readDbConfigMeta();
  if (!meta) {
    return NextResponse.json({ configured: false });
  }
  try {
    const store = await getStore();
    if (!store) {
      return NextResponse.json({ configured: true, meta, error: "Could not build the store." });
    }
    const status = await store.status();
    return NextResponse.json({ configured: true, meta, status });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      meta,
      error: `Could not connect: ${(err as Error).message}`,
    });
  }
}

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  if (!rateLimit(`setupkey:${clientKey(req)}`, 30, 5 * 60_000)) return rateLimited();
  const denied = authorizeSetupKey(req);
  if (denied) return denied;

  const read = await readJsonCapped(req, 16 * 1024);
  if ("error" in read) return read.error;
  const b = (read.body ?? {}) as Record<string, unknown>;
  const action = b.action === "setup" ? "setup" : b.action === "test" ? "test" : null;
  if (!action) {
    return NextResponse.json({ error: 'action must be "test" or "setup".' }, { status: 400 });
  }

  const parsed = parseConfig(b.config);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { config } = parsed;

  if (requiresEncryption(config.kind) && !encryptionAvailable()) {
    return NextResponse.json(
      {
        error:
          "WINREACH_DB_KEY is not set. It is required to encrypt the connection string at rest for non-SQLite backends. Set it on the host and retry.",
      },
      { status: 400 },
    );
  }

  const store = createStore(config);
  try {
    if (action === "test") {
      const status = await store.status();
      return NextResponse.json({ ok: true, action, status });
    }
    // setup
    const status = await store.init();
    await writeDbConfig(config); // encrypts the URL; resets the cached store
    return NextResponse.json({ ok: true, action, status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, action, error: `${(err as Error).message}` },
      { status: 502 },
    );
  } finally {
    await store.close().catch(() => {});
  }
}
