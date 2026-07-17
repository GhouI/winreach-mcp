"use client";

import { useCallback, useEffect, useState } from "react";
import { Section, Warn, btnSecondary } from "@/components/ui";
import { CreatePanel } from "./create-panel";
import { UserRow } from "./user-row";
import { TokenBanner, CodeBlock } from "./token-ui";
import type { ApiUser } from "./types";

/**
 * Signed-in account manager: create / edit / rotate / delete keys and export
 * the WINREACH_PRINCIPALS env value.
 */
export function Manager({ username, onBootChange }: { username: string; onBootChange: () => void }) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [principals, setPrincipals] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    fetch("/api/users")
      .then(async (res) => {
        if (res.status === 401 || res.status === 503) {
          onBootChange(); // session expired -> parent re-renders the sign-in gate
          return;
        }
        const data = await res.json().catch(() => null);
        if (res.ok) setUsers(data.users as ApiUser[]);
        else setErr(data?.error ?? "Could not load accounts.");
      })
      .catch(() => setErr("Could not reach the server."));
  }, [onBootChange]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    onBootChange();
  };

  const exportPrincipals = async () => {
    const res = await fetch("/api/users?format=principals");
    const data = await res.json().catch(() => null);
    if (res.ok) setPrincipals(data.principals as string);
    else setErr(data?.error ?? "Could not export principals.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-prose text-[13px] leading-relaxed text-muted">
          Each account is one agent key (a WINREACH_PRINCIPALS entry). Keys are shown once
          at creation — only a hash is stored.
        </p>
        <p className="flex shrink-0 items-baseline gap-3 text-xs text-muted">
          {username && <span className="font-mono">{username}</span>}
          <button
            type="button"
            onClick={logout}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </p>
      </div>

      {err && <Warn>{err}</Warn>}
      {newToken && (
        <TokenBanner name={newToken.name} token={newToken.token} onDismiss={() => setNewToken(null)} />
      )}

      <CreatePanel
        onCreated={(user, token) => {
          setUsers((prev) => [...prev, user]);
          setNewToken({ name: user.name, token });
        }}
        onError={setErr}
      />

      <Section
        title={`Accounts (${users.length})`}
        desc="Edit permissions, enable/disable, rotate keys, or delete."
      >
        {users.length === 0 ? (
          <p className="text-sm text-muted">No accounts yet. Create one above.</p>
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onChanged={(updated) =>
                  setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => setUsers((prev) => prev.filter((x) => x.id !== id))}
                onToken={(name, token) => setNewToken({ name, token })}
                onError={setErr}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Export WINREACH_PRINCIPALS"
        desc="Built from the stored tokenHash of each enabled account. Paste into your server env."
      >
        <button type="button" onClick={exportPrincipals} className={btnSecondary}>
          Generate principals JSON
        </button>
        {principals !== null && <CodeBlock label="WINREACH_PRINCIPALS" text={principals} />}
      </Section>
    </div>
  );
}
