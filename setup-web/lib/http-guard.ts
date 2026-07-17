// Shared request guards for the API routes: same-origin (CSRF defense in depth),
// a hard body-size cap read BEFORE parsing (pre-auth DoS), and a tiny in-memory
// rate limiter. Server-only (Node runtime). No dependencies.

import { NextResponse, type NextRequest } from "next/server";

/** Best-effort client identifier for rate limiting. */
export function clientKey(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Reject cross-site state-changing requests (defense in depth on top of the
 * SameSite=Lax cookie). Non-browser clients (no Origin/Sec-Fetch-Site) are
 * allowed — they can't be driven by a victim's browser, so there's no CSRF risk.
 * Returns a 403 response to short-circuit, or null when the request may proceed.
 */
export function crossOriginError(req: NextRequest): NextResponse | null {
  const site = req.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin" || site === "none"
      ? null
      : NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (!origin) return null; // no browser Origin -> not a CSRF vector
  try {
    if (new URL(origin).host === req.headers.get("host")) return null;
  } catch {
    /* malformed Origin -> reject below */
  }
  return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
}

/**
 * Read a JSON body, aborting once more than `maxBytes` have arrived so a huge
 * (possibly unauthenticated) body can't be buffered. Returns the parsed body or
 * a NextResponse error (413 too large / 400 bad JSON).
 */
export async function readJsonCapped(
  req: NextRequest,
  maxBytes = 64 * 1024,
): Promise<{ body: unknown } | { error: NextResponse }> {
  const declared = req.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) {
    return { error: NextResponse.json({ error: "Request body too large." }, { status: 413 }) };
  }
  const reader = req.body?.getReader();
  if (!reader) return { body: {} };

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel();
          return { error: NextResponse.json({ error: "Request body too large." }, { status: 413 }) };
        }
        chunks.push(value);
      }
    }
  } catch {
    return { error: NextResponse.json({ error: "Could not read request body." }, { status: 400 }) };
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return { body: {} };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: NextResponse.json({ error: "Body must be JSON." }, { status: 400 }) };
  }
}

/* -------------------------------- rate limit ------------------------------ */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/**
 * Fixed-window limiter. Returns true when the call is allowed. In-memory and
 * per-process — fine for a single self-hosted instance; front with a proxy limiter
 * for multi-instance. Buckets self-expire, so the map stays bounded in practice.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

export function rateLimited(): NextResponse {
  return NextResponse.json(
    { error: "Too many attempts. Wait a bit and try again." },
    { status: 429 },
  );
}
