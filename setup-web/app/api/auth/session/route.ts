// Auth/bootstrap status for the UI. Not secret-gated: it only reports whether
// the app is ready for login and whether the caller's cookie is currently valid.
//
//   { dbConfigured, schemaReady, sessionSecret, adminExists, authenticated, admin? }

import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store/db-config";
import {
  SESSION_COOKIE,
  sessionSecretAvailable,
  verifySessionToken,
} from "@/lib/store/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionSecret = sessionSecretAvailable();
  let store;
  try {
    store = await getStore();
  } catch (err) {
    // e.g. WINBRIDGE_DB_KEY missing/incorrect so the persisted URL can't decrypt.
    return NextResponse.json({
      dbConfigured: true,
      schemaReady: false,
      sessionSecret,
      adminExists: false,
      authenticated: false,
      error: (err as Error).message,
    });
  }
  if (!store) {
    return NextResponse.json({
      dbConfigured: false,
      schemaReady: false,
      sessionSecret,
      adminExists: false,
      authenticated: false,
    });
  }

  try {
    const status = await store.status();
    const adminExists = status.schemaReady ? (await store.countAdmins()) > 0 : false;
    const aid = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    const admin = aid && status.schemaReady ? await store.getAdminById(aid) : null;
    return NextResponse.json({
      dbConfigured: true,
      schemaReady: status.schemaReady,
      sessionSecret,
      adminExists,
      authenticated: Boolean(admin),
      admin: admin ? { id: admin.id, username: admin.username } : undefined,
    });
  } catch (err) {
    return NextResponse.json({
      dbConfigured: true,
      schemaReady: false,
      sessionSecret,
      adminExists: false,
      authenticated: false,
      error: (err as Error).message,
    });
  }
}
