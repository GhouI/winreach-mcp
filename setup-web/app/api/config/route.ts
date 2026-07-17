// Agent-facing configuration endpoint.
//
//   GET  /api/config  -> the saved WinReach setup config (JSON)
//   PUT  /api/config  -> replace the saved config (JSON body)
//
// Both require the setup key:  Authorization: Bearer <WINREACH_SETUP_KEY>
// (or an `x-setup-key` header). The endpoint is DISABLED until the
// WINREACH_SETUP_KEY environment variable is set on the host running this
// app, so nothing is exposed by default.

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readStoredConfig, writeStoredConfig } from "@/lib/config-store";
import { sanitizeConfig } from "@/lib/form-state";
import { clientKey, crossOriginError, rateLimit, rateLimited, readJsonCapped } from "@/lib/http-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function presentedKey(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-setup-key")?.trim() ?? "";
}

function authorize(req: NextRequest): NextResponse | null {
  const expected = process.env.WINREACH_SETUP_KEY;
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "Agent API disabled: set WINREACH_SETUP_KEY on the host running setup-web to enable it.",
      },
      { status: 503 },
    );
  }
  const given = presentedKey(req);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json(
      { error: "Unauthorized: send Authorization: Bearer <WINREACH_SETUP_KEY>." },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  if (!rateLimit(`setupkey:${clientKey(req)}`, 30, 5 * 60_000)) return rateLimited();
  const denied = authorize(req);
  if (denied) return denied;

  const stored = await readStoredConfig();
  if (!stored) {
    return NextResponse.json(
      { error: "No configuration has been saved yet." },
      { status: 404 },
    );
  }
  return NextResponse.json(stored);
}

export async function PUT(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  if (!rateLimit(`setupkey:${clientKey(req)}`, 30, 5 * 60_000)) return rateLimited();
  const denied = authorize(req);
  if (denied) return denied;

  const parsed = await readJsonCapped(req, 256 * 1024);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  // Accept either a bare config or { config: ... }; unknown fields are dropped
  // and missing ones fall back to defaults.
  const raw =
    body && typeof body === "object" && "config" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).config
      : body;

  const config = sanitizeConfig(raw);
  const updatedBy = presentedKey(req) ? "agent" : "web";
  const saved = await writeStoredConfig(
    config,
    req.headers.get("x-updated-by") === "web" ? "web" : updatedBy,
  );
  return NextResponse.json(saved);
}
