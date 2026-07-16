"use client";

// Editor for the multi-user (WINBRIDGE_PRINCIPALS) access model. Controlled:
// all state lives in the wizard and flows in via `users` / `onChange`.

import { useState } from "react";
import { ROLE_PRESETS, TOOL_NAMES, generateToken } from "@/lib/winbridge-config";
import { newUser, type FormUser } from "@/lib/form-state";
import { Field, TextArea, TextInput, Toggle, Warn } from "@/components/ui";

const ROLES = ["admin", "operator", "readonly", "custom"];

export function UsersEditor({
  users,
  onChange,
}: {
  users: FormUser[];
  onChange: (users: FormUser[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<FormUser>) =>
    onChange(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const remove = (id: string) => onChange(users.filter((u) => u.id !== id));
  const add = () => onChange([...users, newUser(`user${users.length + 1}`)]);

  const setRole = (id: string, role: string) => {
    const preset = ROLE_PRESETS[role] ?? ROLE_PRESETS.custom;
    update(id, {
      role,
      allTools: preset.allTools,
      tools: [...preset.tools],
      allow: preset.allow.join("\n"),
      deny: preset.deny.join("\n"),
    });
  };

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleTool = (u: FormUser, tool: string) => {
    const has = u.tools.includes(tool);
    update(u.id, { tools: has ? u.tools.filter((t) => t !== tool) : [...u.tools, tool] });
  };

  const setAllTools = (u: FormUser, all: boolean) =>
    update(u.id, {
      allTools: all,
      // When switching to a restricted list, start from "everything selected".
      tools: all ? u.tools : u.tools.length ? u.tools : [...TOOL_NAMES],
    });

  // Warnings.
  const names = users.map((u) => u.name.trim().toLowerCase()).filter(Boolean);
  const dupName = names.length !== new Set(names).size;
  const tokens = users.map((u) => u.token.trim());
  const dupToken = tokens.filter(Boolean).length !== new Set(tokens.filter(Boolean)).size;
  const emptyToken = users.some((u) => !u.token.trim());
  const noTools = users.some((u) => !u.allTools && u.tools.length === 0);

  return (
    <div className="space-y-4">
      {users.length === 0 && (
        <Warn>No users yet. Add at least one — each gets its own key, role, and permissions.</Warn>
      )}

      <div className="space-y-4">
        {users.map((u) => {
          const isOpen = expanded.has(u.id);
          return (
            <div key={u.id} className="rounded-xl border border-border bg-background/60 p-4">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <Field label="Name">
                  <TextInput value={u.name} onChange={(v) => update(u.id, { name: v })} placeholder="alice" mono />
                </Field>
                <Field label="Role" hint="Presets fill tools & command rules; edit below.">
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u.id, e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-xs outline-none transition hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Key (bearer token)">
                  <div className="flex gap-2">
                    <TextInput value={u.token} onChange={(v) => update(u.id, { token: v })} placeholder="click Regenerate" mono />
                    <button
                      type="button"
                      onClick={() => update(u.id, { token: generateToken() })}
                      className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(u.token)}
                      className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      Copy
                    </button>
                  </div>
                </Field>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => toggleExpanded(u.id)}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {isOpen ? "Hide permissions" : "Edit permissions (tools & commands)"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-4 border-t border-border pt-4">
                  <div>
                    <div className="mb-2">
                      <Toggle
                        checked={u.allTools}
                        onChange={(v) => setAllTools(u, v)}
                        label="All tools"
                        description="On = every tool (no tools restriction). Off = choose specific tools."
                      />
                    </div>
                    {!u.allTools && (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {TOOL_NAMES.map((tool) => (
                          <label key={tool} className="flex items-center gap-2 text-[13px]">
                            <input
                              type="checkbox"
                              checked={u.tools.includes(tool)}
                              onChange={() => toggleTool(u, tool)}
                              className="size-3.5 accent-[var(--color-accent,#2563eb)]"
                            />
                            <span className="font-mono">{tool}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                    <Field label="Command allowlist" hint="Blank = allow all (subject to deny)">
                      <TextArea value={u.allow} onChange={(v) => update(u.id, { allow: v })} placeholder={"^Get-\n^Test-"} />
                    </Field>
                    <Field label="Command denylist">
                      <TextArea value={u.deny} onChange={(v) => update(u.id, { deny: v })} placeholder={"Remove-Item\nFormat-Volume"} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-surface px-4 text-sm font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        + Add user
      </button>

      {dupName && <Warn>Two users share a name. Give each a distinct name.</Warn>}
      {(dupToken || emptyToken) && (
        <Warn>Every user needs a unique, non-empty key. Regenerate any that are blank or duplicated.</Warn>
      )}
      {noTools && <Warn>A user has no tools selected — that key would be able to do nothing.</Warn>}
    </div>
  );
}
