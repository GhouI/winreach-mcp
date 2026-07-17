// Admin login: verify username + password (scrypt) and issue a signed session
// cookie. The missing-user path still runs scrypt against a dummy hash so
// response timing does not reveal whether a username exists.

import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store/db-config";
import { hashPassword, verifyPassword } from "@/lib/store/crypto";
import { createSessionToken, sessionSecretAvailable, setSessionCookie } from "@/lib/store/session";
import { clientKey, crossOriginError, rateLimit, rateLimited, readJsonCapped } from "@/lib/http-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Computed once at startup; equalizes scrypt cost for the "no such user" path.
const DUMMY_HASH = hashPassword("winbridge-login-timing-equalizer");

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  if (!rateLimit(`login:${clientKey(req)}`, 10, 5 * 60_000)) return rateLimited();

  const store = await getStore();
  if (!store) {
    return NextResponse.json(
      { error: "No database configured. Complete the Database setup first.", code: "no_db" },
      { status: 503 },
    );
  }
  if (!sessionSecretAvailable()) {
    return NextResponse.json(
      { error: "Set WINBRIDGE_SESSION_SECRET (or WINBRIDGE_DB_KEY) on the host to enable admin login.", code: "no_secret" },
      { status: 503 },
    );
  }

  const parsed = await readJsonCapped(req);
  if ("error" in parsed) return parsed.error;
  const { username, password } = (parsed.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "username and password are required." }, { status: 400 });
  }

  try {
    const admin = await store.getAdminByUsername(username.trim());
    // Always pay the scrypt cost so a missing user and a wrong password are
    // indistinguishable by timing.
    const ok = verifyPassword(password, admin ? admin.passwordHash : DUMMY_HASH);
    if (!admin || !ok) {
      return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, admin: { id: admin.id, username: admin.username } });
    setSessionCookie(res, createSessionToken(admin.id));
    return res;
  } catch (err) {
    console.error("login failed:", err);
    return NextResponse.json({ error: "Login failed." }, { status: 502 });
  }
}
