// First-run admin creation. Allowed ONLY when no admin exists yet; afterwards
// this returns 409 and login is required. Requires the database to be configured
// and a session secret to be present.

import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store/db-config";
import { hashPassword } from "@/lib/store/crypto";
import {
  createSessionToken,
  sessionSecretAvailable,
  setSessionCookie,
} from "@/lib/store/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const store = await getStore();
  if (!store) {
    return NextResponse.json(
      { error: "No database configured. Complete the Database setup first.", code: "no_db" },
      { status: 503 },
    );
  }
  if (!sessionSecretAvailable()) {
    return NextResponse.json(
      {
        error:
          "Set WINBRIDGE_SESSION_SECRET (or WINBRIDGE_DB_KEY) on the host to enable admin login.",
        code: "no_secret",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const { username, password } = (body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || !username.trim()) {
    return NextResponse.json({ error: "username is required." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters." }, { status: 400 });
  }

  try {
    await store.init();
    if ((await store.countAdmins()) > 0) {
      return NextResponse.json(
        { error: "An admin already exists. Please log in.", code: "admin_exists" },
        { status: 409 },
      );
    }
    const admin = await store.createAdmin(username.trim(), hashPassword(password));
    const res = NextResponse.json({ ok: true, admin: { id: admin.id, username: admin.username } });
    setSessionCookie(res, createSessionToken(admin.id));
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: `Could not create admin: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
