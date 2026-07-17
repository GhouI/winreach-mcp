"use client";

// Editor for the multi-user (WINBRIDGE_PRINCIPALS) access model. Controlled:
// all state lives in the wizard and flows in via `users` / `onChange`.

import { useState } from "react";
import { ROLE_PRESETS, TOOL_NAMES, generateToken } from "@/lib/winbridge-config";
import { newUser, type FormUser } from "@/lib/form-state";
import { Field, Select, TextArea, TextInput, Toggle, Warn } from "@/components/ui";

export function UsersEditor({
  users,
  roles,
  onChange,
}: {
  users: FormUser[];
  /** Names of the roles defined above; a user on one of these inherits its permissions. */
  roles: string[];
  onChange: (users: FormUser[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const update = (id: string, patch: Partial<FormUser>) =>
    onChange(users.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const remove = (id: string) => onChange(users.filter((u) => u.id !== id));
  const add = () => onChange([...users, newUser(`user${users.length + 1}`)]);

  // "custom" keeps the inline per-user permission editor; a defined role name
  // means the user inherits that role's tools/commands.
  const roleOptions = (current: string) =>
    Array.from(new Set([...roles, "custom", current].filter(Boolean)));

  const setRole = (id: string, role: string) => {
    if (roles.includes(role)) {
      // Inherited role — the user carries no inline permissions of its own.
      update(id, { role });
      return;
    }
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
  // Only meaningful for users editing inline permissions; inherited users get
  // their tools from the role.
  const noTools = users.some((u) => !roles.includes(u.role) && !u.allTools && u.tools.length === 0);

  return (
    <div className="space-y-4">
      {users.length === 0 && (
        <Warn>No users yet. Add at least one — each gets its own key, role, and permissions.</Warn>
      )}

      <div className="space-y-4">
        {users.map((u) => {
          const isOpen = expanded.has(u.id);
          const inherited = roles.includes(u.role);
          return (
            <div key={u.id} className="rounded-md border border-border bg-background/60 p-4">
              <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                <Field label="Name">
                  <TextInput value={u.name} onChange={(v) => update(u.id, { name: v })} placeholder="alice" mono />
                </Field>
                <Field label="Role" hint="Pick a defined role to inherit, or 'custom' to set permissions here.">
                  <Select value={u.role} onChange={(v) => setRole(u.id, v)} options={roleOptions(u.role)} />
                </Field>
              </div>

              <div className="mt-4">
                <Field label="Key (bearer token)">
                  <div className="flex gap-2">
                    <TextInput value={u.token} onChange={(v) => update(u.id, { token: v })} placeholder="click Regenerate" mono />
                    <button
                      type="button"
                      onClick={() => update(u.id, { token: generateToken() })}
                      className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium transition-colors hover:bg-surface-muted"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(u.token)}
                      className="inline-flex h-9 shrink-0 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium transition-colors hover:bg-surface-muted"
                    >
                      Copy
                    </button>
                  </div>
                </Field>
              </div>

              <div className="mt-3 flex items-center justify-between">
                {inherited ? (
                  <span className="text-xs text-muted">
                    Inherits <span className="font-mono text-foreground">{u.role}</span> permissions
                    (defined above)
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(u.id)}
                    className="text-xs font-medium text-accent-text hover:underline"
                  >
                    {isOpen ? "Hide permissions" : "Edit permissions (tools & commands)"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  className="text-xs font-medium text-danger hover:underline"
                >
                  Remove
                </button>
              </div>

              {!inherited && isOpen && (
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
                              className="size-3.5 accent-[var(--accent)]"
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
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
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
