// Admin login: verify username + password (scrypt) and issue a signed session
// cookie. Uses a constant-ish path so a missing user and a bad password look the
// same to the caller.

import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store/db-config";
import { verifyPassword } from "@/lib/store/crypto";
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
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "username and password are required." }, { status: 400 });
  }

  try {
    const admin = await store.getAdminByUsername(username.trim());
    if (!admin || !verifyPassword(password, admin.passwordHash)) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, admin: { id: admin.id, username: admin.username } });
    setSessionCookie(res, createSessionToken(admin.id));
    return res;
  } catch (err) {
    return NextResponse.json({ error: `Login failed: ${(err as Error).message}` }, { status: 502 });
  }
}
