// Account (user / agent-key) collection endpoint. Session-protected.
//
//   GET  /api/users                    -> list users (no secrets)
//   GET  /api/users?format=principals  -> WINBRIDGE_PRINCIPALS JSON (tokenHash)
//   POST /api/users                    -> create; returns the plaintext token ONCE
//
// On create the server generates the token, stores only its SHA-256 hash
// (token_hash) plus an optional AES-GCM copy (token_enc), and returns the
// plaintext exactly once. It is never returned again.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/store/session";
import { crossOriginError, readJsonCapped } from "@/lib/http-guard";
import { buildPrincipalsFromUsers } from "@/lib/store/principals";
import { encryptAtRest, encryptionAvailable, generateToken, hashToken } from "@/lib/store/crypto";
import type { AccountUser, NewUserInput } from "@/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public view of a user — no token material beyond a hint that a copy exists. */
function publicUser(u: AccountUser) {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    tools: u.tools,
    allow: u.allow,
    deny: u.deny,
    enabled: u.enabled,
    createdAt: u.createdAt,
    lastUsedAt: u.lastUsedAt,
    tokenHash: u.tokenHash,
    hasEncryptedToken: u.tokenEnc !== null,
  };
}

function toStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const users = await auth.store.listUsers();
  if (new URL(req.url).searchParams.get("format") === "principals") {
    return NextResponse.json({ principals: buildPrincipalsFromUsers(users) });
  }
  return NextResponse.json({ users: users.map(publicUser) });
}

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const parsed = await readJsonCapped(req, 32 * 1024);
  if ("error" in parsed) return parsed.error;
  const b = (parsed.body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });
  const role = typeof b.role === "string" && b.role.trim() ? b.role.trim() : "user";
  // tools: null (or missing) = all tools; an array restricts.
  const tools = b.tools === null || b.tools === undefined ? null : toStringList(b.tools);
  const allow = toStringList(b.allow);
  const deny = toStringList(b.deny);
  const enabled = b.enabled === undefined ? true : Boolean(b.enabled);

  const token = generateToken();
  const input: NewUserInput = {
    name,
    role,
    tokenHash: hashToken(token),
    tokenEnc: encryptionAvailable() ? encryptAtRest(token) : null,
    tools,
    allow,
    deny,
    enabled,
  };

  try {
    const user = await auth.store.createUser(input);
    // The plaintext token is returned exactly once, here.
    return NextResponse.json({ user: publicUser(user), token }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const conflict = /unique|duplicate/i.test(msg);
    return NextResponse.json(
      { error: conflict ? "A user with that name already exists." : `Could not create user: ${msg}` },
      { status: conflict ? 409 : 502 },
    );
  }
}
