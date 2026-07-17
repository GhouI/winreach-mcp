// Signed session cookies for admin login. Server-only (node:crypto).
//
// A session is a stateless, tamper-evident token: base64url(JSON payload) +
// "." + HMAC-SHA256(payload) using a secret derived from WINREACH_SESSION_SECRET
// (preferred) or WINREACH_DB_KEY. The cookie is httpOnly + SameSite=Lax and its
// signature and expiry are re-verified on every protected request. No session
// state is stored server-side; revocation is by expiry.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { AccountStore, AdminAccount } from "@/lib/store/types";
import { getStore } from "@/lib/store/db-config";

export const SESSION_COOKIE = "winreach_admin";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

type SessionPayload = { aid: string; exp: number };

const NO_SECRET =
  "Admin login is disabled: set WINREACH_SESSION_SECRET (or WINREACH_DB_KEY) on the host to sign sessions.";

export function sessionSecretAvailable(): boolean {
  return Boolean(process.env.WINREACH_SESSION_SECRET || process.env.WINREACH_DB_KEY);
}

function sessionSecret(): string {
  const secret = process.env.WINREACH_SESSION_SECRET || process.env.WINREACH_DB_KEY;
  if (!secret) throw new Error(NO_SECRET);
  return secret;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

// Purpose-separated signing key derived from the secret, so session HMACs never
// use the same key material as the AES-GCM at-rest key (which derives from the
// same secret via scrypt with a different label). Cached per process.
let cachedSessionKey: Buffer | null = null;
function sessionKey(): Buffer {
  if (!cachedSessionKey) {
    cachedSessionKey = createHmac("sha256", sessionSecret()).update("winreach-session-hmac-v1").digest();
  }
  return cachedSessionKey;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", sessionKey()).update(payloadB64).digest("base64url");
}

/** Build a signed session token for an admin, valid for SESSION_MAX_AGE_SECONDS. */
export function createSessionToken(adminId: string): string {
  const payload: SessionPayload = {
    aid: adminId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64)}`;
}

/** Verify signature + expiry; returns the admin id or null. */
export function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = sign(payloadB64);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.aid || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.aid;
  } catch {
    return null;
  }
}

/** Attach the session cookie to a response. */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie on a response. */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export type AuthContext = { store: AccountStore; admin: AdminAccount };

/**
 * Resolve the authenticated admin for a protected route. On failure returns a
 * NextResponse (401/503) to short-circuit; on success returns { store, admin }.
 */
export async function requireAdmin(req: NextRequest): Promise<NextResponse | AuthContext> {
  const store = await getStore();
  if (!store) {
    return NextResponse.json(
      { error: "No database configured. Complete the Database setup first.", code: "no_db" },
      { status: 503 },
    );
  }
  const aid = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!aid) {
    return NextResponse.json({ error: "Unauthorized.", code: "unauthorized" }, { status: 401 });
  }
  let admin: AdminAccount | null;
  try {
    admin = await store.getAdminById(aid);
  } catch {
    return NextResponse.json(
      { error: "Database error while verifying session.", code: "db_error" },
      { status: 503 },
    );
  }
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized.", code: "unauthorized" }, { status: 401 });
  }
  return { store, admin };
}
