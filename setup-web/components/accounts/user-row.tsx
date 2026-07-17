"use client";

import { useState } from "react";
import { btnDanger, btnPrimary, btnSecondary } from "@/components/ui";
import { DraftEditor } from "./draft-editor";
import { draftFromUser, draftToBody, type ApiUser, type Draft } from "./types";

/** One account: summary row plus an expandable edit / rotate / delete panel. */
export function UserRow({
  user,
  onChanged,
  onDeleted,
  onToken,
  onError,
}: {
  user: ApiUser;
  onChanged: (u: ApiUser) => void;
  onDeleted: (id: string) => void;
  onToken: (name: string, token: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFromUser(user));
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, opts?: { token?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(data?.error ?? `Update failed (${res.status}).`);
        return;
      }
      onChanged(data.user as ApiUser);
      if (opts?.token && data.token) onToken(user.name, data.token as string);
    } catch {
      onError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!confirm(`Delete account "${user.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        onError(data?.error ?? `Delete failed (${res.status}).`);
        return;
      }
      onDeleted(user.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="truncate font-mono text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted">{user.role}</span>
            <span className={`text-xs font-medium ${user.enabled ? "text-ok" : "text-faint"}`}>
              {user.enabled ? "enabled" : "disabled"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {user.tools === null ? "all tools" : `${user.tools.length} tool${user.tools.length === 1 ? "" : "s"}`} ·
            created {new Date(user.createdAt).toLocaleDateString()} ·
            <span className="font-mono"> {user.tokenHash.slice(0, 12)}…</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => patch({ enabled: !user.enabled })}
            className={`${btnSecondary} h-8 px-3 text-xs`}
          >
            {user.enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`${btnSecondary} h-8 px-3 text-xs`}
          >
            {open ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={del}
            className={`${btnDanger} h-8 px-3 text-xs`}
          >
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-5 border-t border-border pt-4">
          <DraftEditor draft={draft} onChange={setDraft} hideEnabled />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => patch(draftToBody({ ...draft, enabled: user.enabled }))}
              className={`${btnPrimary} h-8 px-3.5 text-xs`}
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (confirm(`Rotate the key for "${user.name}"? The old key stops working.`)) {
                  void patch({ regenerateToken: true }, { token: true });
                }
              }}
              className={`${btnSecondary} h-8 px-3.5 text-xs`}
            >
              Rotate key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
