// Single account (user) endpoint. Session-protected.
//
//   PATCH  /api/users/:id  -> update name/role/tools/allow/deny/enabled;
//                             optionally { regenerateToken: true } to mint a new
//                             token (returned ONCE in the response).
//   DELETE /api/users/:id  -> remove the user.

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/store/session";
import { encryptAtRest, encryptionAvailable, generateToken, hashToken } from "@/lib/store/crypto";
import type { AccountUser, UserPatch } from "@/lib/store/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: UserPatch = {};
  if (typeof b.name === "string") {
    if (!b.name.trim()) return NextResponse.json({ error: "name cannot be empty." }, { status: 400 });
    patch.name = b.name.trim();
  }
  if (typeof b.role === "string" && b.role.trim()) patch.role = b.role.trim();
  if ("tools" in b) patch.tools = b.tools === null ? null : toStringList(b.tools);
  if ("allow" in b) patch.allow = toStringList(b.allow);
  if ("deny" in b) patch.deny = toStringList(b.deny);
  if ("enabled" in b) patch.enabled = Boolean(b.enabled);

  // Optional token rotation — the new plaintext is returned once, below.
  let newToken: string | null = null;
  if (b.regenerateToken === true) {
    newToken = generateToken();
    patch.tokenHash = hashToken(newToken);
    patch.tokenEnc = encryptionAvailable() ? encryptAtRest(newToken) : null;
  }

  try {
    const existing = await auth.store.getUserById(id);
    if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });
    const user = await auth.store.updateUser(id, patch);
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json(newToken ? { user: publicUser(user), token: newToken } : { user: publicUser(user) });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    const conflict = /unique|duplicate/i.test(msg);
    return NextResponse.json(
      { error: conflict ? "A user with that name already exists." : `Could not update user: ${msg}` },
      { status: conflict ? 409 : 502 },
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  try {
    const ok = await auth.store.deleteUser(id);
    if (!ok) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not delete user: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
