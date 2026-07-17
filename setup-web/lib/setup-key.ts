// Shared WINBRIDGE_SETUP_KEY bearer authorization, matching app/api/config.
// The guarded endpoint stays disabled until the operator sets WINBRIDGE_SETUP_KEY
// on the host, so nothing is exposed by default.

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

export function presentedSetupKey(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-setup-key")?.trim() ?? "";
}

/** Returns a NextResponse to short-circuit on failure, or null when authorized. */
export function authorizeSetupKey(req: NextRequest): NextResponse | null {
  const expected = process.env.WINBRIDGE_SETUP_KEY;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Setup API disabled: set WINBRIDGE_SETUP_KEY on the host running setup-web to enable it.",
      },
      { status: 503 },
    );
  }
  const given = presentedSetupKey(req);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json(
      { error: "Unauthorized: send Authorization: Bearer <WINBRIDGE_SETUP_KEY>." },
      { status: 401 },
    );
  }
  return null;
}
