"use client";

// Authenticated Accounts manager. Lists account keys, creates/edits/deletes
// them via the session-protected /api/users routes, shows a newly minted token
// exactly once, and exports WINBRIDGE_PRINCIPALS (built from stored tokenHashes).

import { useCallback, useEffect, useState } from "react";
import { ROLE_PRESETS, TOOL_NAMES, parseList } from "@/lib/winbridge-config";
import { Field, Grid, Section, TextArea, TextInput, Toggle, Warn } from "@/components/ui";
import { AdminShell, btnPrimary, btnSecondary } from "@/components/admin-shell";
import {
  BotIcon,
  CheckIcon,
  CopyIcon,
  LogOutIcon,
  SparklesIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/icons";

type ApiUser = {
  id: string;
  name: string;
  role: string;
  tools: string[] | null;
  allow: string[];
  deny: string[];
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  tokenHash: string;
  hasEncryptedToken: boolean;
};

const ROLES = ["admin", "operator", "readonly", "custom"];

type Draft = {
  name: string;
  role: string;
  allTools: boolean;
  tools: string[];
  allow: string;
  deny: string;
  enabled: boolean;
};

function emptyDraft(): Draft {
  const p = ROLE_PRESETS.admin;
  return { name: "", role: "admin", allTools: p.allTools, tools: [...p.tools], allow: "", deny: "", enabled: true };
}

function draftFromUser(u: ApiUser): Draft {
  return {
    name: u.name,
    role: u.role,
    allTools: u.tools === null,
    tools: u.tools ?? [],
    allow: u.allow.join("\n"),
    deny: u.deny.join("\n"),
    enabled: u.enabled,
  };
}

function draftToBody(d: Draft) {
  return {
    name: d.name.trim(),
    role: d.role,
    tools: d.allTools ? null : d.tools,
    allow: parseList(d.allow),
    deny: parseList(d.deny),
    enabled: d.enabled,
  };
}

export default function AccountsPage() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [principals, setPrincipals] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.status === 401 || res.status === 503) {
      window.location.href = "/login";
      return;
    }
    const data = await res.json().catch(() => null);
    if (res.ok) setUsers(data.users as ApiUser[]);
    else setErr(data?.error ?? "Could not load accounts.");
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.authenticated) {
          window.location.href = "/login";
          return;
        }
        setUsername(d?.admin?.username ?? "");
        setReady(true);
        void loadUsers();
      })
      .catch(() => {
        window.location.href = "/login";
      });
  }, [loadUsers]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  const exportPrincipals = async () => {
    const res = await fetch("/api/users?format=principals");
    const data = await res.json().catch(() => null);
    if (res.ok) setPrincipals(data.principals as string);
    else setErr(data?.error ?? "Could not export principals.");
  };

  if (!ready) {
    return (
      <AdminShell crumb="Accounts">
        <p className="text-sm text-muted">Loading…</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      crumb="Accounts"
      right={
        <div className="flex items-center gap-3">
          {username && <span className="hidden text-muted sm:inline">{username}</span>}
          <button type="button" onClick={logout} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium transition hover:bg-surface-muted">
            <LogOutIcon className="size-3.5" />
            Log out
          </button>
        </div>
      }
    >
      <div className="mb-8 max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Accounts</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          Each account is one agent key (a WINBRIDGE_PRINCIPALS entry). Keys are shown once at
          creation — only a hash is stored. Export the principals JSON for your server config.
        </p>
      </div>

      {err && (
        <div className="mb-5">
          <Warn>{err}</Warn>
        </div>
      )}

      {newToken && (
        <div className="mb-5">
          <TokenBanner name={newToken.name} token={newToken.token} onDismiss={() => setNewToken(null)} />
        </div>
      )}

      <div className="space-y-5">
        <CreatePanel
          onCreated={(user, token) => {
            setUsers((prev) => [...prev, user]);
            setNewToken({ name: user.name, token });
          }}
          onError={setErr}
        />

        <Section icon={<UsersIcon className="size-4" />} title={`Accounts (${users.length})`} desc="Edit permissions, enable/disable, rotate keys, or delete.">
          {users.length === 0 ? (
            <p className="text-sm text-muted">No accounts yet. Create one above.</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  onChanged={(updated) => setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))}
                  onDeleted={(id) => setUsers((prev) => prev.filter((x) => x.id !== id))}
                  onToken={(name, token) => setNewToken({ name, token })}
                  onError={setErr}
                />
              ))}
            </div>
          )}
        </Section>

        <Section icon={<BotIcon className="size-4" />} title="Export WINBRIDGE_PRINCIPALS" desc="Built from the stored tokenHash of each enabled account. Paste into your server env.">
          <button type="button" onClick={exportPrincipals} className={btnSecondary}>
            Generate principals JSON
          </button>
          {principals !== null && <CodeBlock label="WINBRIDGE_PRINCIPALS" text={principals} />}
        </Section>
      </div>
    </AdminShell>
  );
}

/* -------------------------------- Create --------------------------------- */

function CreatePanel({
  onCreated,
  onError,
}: {
  onCreated: (user: ApiUser, token: string) => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!draft.name.trim()) {
      onError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftToBody(draft)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(data?.error ?? `Create failed (${res.status}).`);
        return;
      }
      onCreated(data.user as ApiUser, data.token as string);
      setDraft(emptyDraft());
    } catch {
      onError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section icon={<SparklesIcon className="size-4" />} title="Create account" desc="A random key is generated on the server and shown once.">
      <DraftEditor draft={draft} onChange={setDraft} />
      <button type="button" disabled={busy} onClick={create} className={btnPrimary}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </Section>
  );
}

/* --------------------------------- Row ----------------------------------- */

function UserRow({
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
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{user.name}</span>
            <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">{user.role}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                user.enabled
                  ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : "bg-surface-muted text-faint"
              }`}
            >
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
          <button type="button" disabled={busy} onClick={() => patch({ enabled: !user.enabled })} className={btnSecondary + " h-8 px-3 text-xs"}>
            {user.enabled ? "Disable" : "Enable"}
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} className={btnSecondary + " h-8 px-3 text-xs"}>
            {open ? "Close" : "Edit"}
          </button>
          <button type="button" disabled={busy} onClick={del} aria-label="Delete" className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-500/30 px-2.5 text-xs font-medium text-red-600 transition hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400">
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <DraftEditor draft={draft} onChange={setDraft} hideEnabled />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => patch(draftToBody({ ...draft, enabled: user.enabled }))} className={btnPrimary + " h-8 px-3.5 text-xs"}>
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
              className={btnSecondary + " h-8 px-3.5 text-xs"}
            >
              Rotate key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Draft editor ------------------------------ */

function DraftEditor({
  draft,
  onChange,
  hideEnabled,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  hideEnabled?: boolean;
}) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setRole = (role: string) => {
    const p = ROLE_PRESETS[role] ?? ROLE_PRESETS.custom;
    set({ role, allTools: p.allTools, tools: [...p.tools], allow: p.allow.join("\n"), deny: p.deny.join("\n") });
  };
  const toggleTool = (tool: string) =>
    set({ tools: draft.tools.includes(tool) ? draft.tools.filter((t) => t !== tool) : [...draft.tools, tool] });

  return (
    <div className="space-y-4">
      <Grid>
        <Field label="Name">
          <TextInput value={draft.name} onChange={(v) => set({ name: v })} placeholder="alice" mono />
        </Field>
        <Field label="Role" hint="Presets fill tools & command rules; edit below.">
          <select
            value={draft.role}
            onChange={(e) => setRole(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-xs outline-none transition hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </Grid>

      <div>
        <div className="mb-2">
          <Toggle
            checked={draft.allTools}
            onChange={(v) => set({ allTools: v, tools: v ? draft.tools : draft.tools.length ? draft.tools : [...TOOL_NAMES] })}
            label="All tools"
            description="On = every tool. Off = choose specific tools."
          />
        </div>
        {!draft.allTools && (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {TOOL_NAMES.map((tool) => (
              <label key={tool} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={draft.tools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                  className="size-3.5 accent-[var(--color-accent,#2563eb)]"
                />
                <span className="font-mono">{tool}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Grid>
        <Field label="Command allowlist" hint="Blank = allow all (subject to deny)">
          <TextArea value={draft.allow} onChange={(v) => set({ allow: v })} placeholder={"^Get-\n^Test-"} />
        </Field>
        <Field label="Command denylist">
          <TextArea value={draft.deny} onChange={(v) => set({ deny: v })} placeholder={"Remove-Item\nFormat-Volume"} />
        </Field>
      </Grid>

      {!hideEnabled && (
        <Toggle checked={draft.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" description="Disabled keys are excluded from the principals export." />
      )}
    </div>
  );
}

/* ------------------------------- Token UI -------------------------------- */

function TokenBanner({ name, token, onDismiss }: { name: string; token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/8 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Key for “{name}” — shown once</p>
          <p className="mt-0.5 text-xs text-muted">Copy it now. Only its hash is stored; you cannot see it again.</p>
        </div>
        <button type="button" onClick={onDismiss} className="text-xs font-medium text-muted hover:text-foreground">
          Dismiss
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12.5px]">{token}</code>
        <button type="button" onClick={copy} className={btnSecondary + " h-8 shrink-0 px-3 text-xs"}>
          {copied ? <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function CodeBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-code">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] text-code-muted">{label}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-code-muted transition hover:bg-white/10 hover:text-white">
          {copied ? <CheckIcon className="size-3.5 text-emerald-400" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-scroll max-h-[50vh] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-6 text-code-fg">
        {text || "[]"}
      </pre>
    </div>
  );
}
