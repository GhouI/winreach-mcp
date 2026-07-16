// Admin logout: clear the session cookie. No body required.

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/store/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
