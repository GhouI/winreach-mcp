// Admin logout: clear the session cookie. No body required.

import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/store/session";
import { crossOriginError } from "@/lib/http-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
