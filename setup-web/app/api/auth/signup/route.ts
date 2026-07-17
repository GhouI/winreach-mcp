// First-run admin creation. Gated by the operator's WINBRIDGE_SETUP_KEY so an
// anonymous caller cannot claim the admin (and thus /api/shell RCE) during the
// window before the operator signs up. Allowed ONLY when no admin exists yet.

import { NextResponse, type NextRequest } from "next/server";
import { getStore } from "@/lib/store/db-config";
import { hashPassword } from "@/lib/store/crypto";
import { createSessionToken, sessionSecretAvailable, setSessionCookie } from "@/lib/store/session";
import { authorizeSetupKey } from "@/lib/setup-key";
import { crossOriginError, readJsonCapped } from "@/lib/http-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  const denied = authorizeSetupKey(req);
  if (denied) return denied;

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
  if (typeof username !== "string" || !username.trim()) {
    return NextResponse.json({ error: "username is required." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 12) {
    return NextResponse.json({ error: "password must be at least 12 characters." }, { status: 400 });
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
    console.error("signup failed:", err);
    return NextResponse.json({ error: "Could not create admin." }, { status: 502 });
  }
}
