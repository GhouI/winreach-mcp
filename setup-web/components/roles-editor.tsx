"use client";

// Editor for reusable roles (WINREACH_ROLES). A role is a named permission set
// — a tool allowlist plus command allow/deny — that users inherit by name.
// Controlled: all state lives in the wizard and flows in via `roles` / `onChange`.

import { TOOL_NAMES } from "@/lib/winreach-config";
import { newRole, type FormRole } from "@/lib/form-state";
import { Field, TextArea, TextInput, Toggle, Warn } from "@/components/ui";

export function RolesEditor({
  roles,
  onChange,
}: {
  roles: FormRole[];
  onChange: (roles: FormRole[]) => void;
}) {
  const update = (id: string, patch: Partial<FormRole>) =>
    onChange(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(roles.filter((r) => r.id !== id));
  const add = () => onChange([...roles, newRole("")]);

  const toggleTool = (r: FormRole, tool: string) => {
    const has = r.tools.includes(tool);
    update(r.id, { tools: has ? r.tools.filter((t) => t !== tool) : [...r.tools, tool] });
  };

  const setAllTools = (r: FormRole, all: boolean) =>
    update(r.id, {
      allTools: all,
      // When switching to a restricted list, start from "everything selected".
      tools: all ? r.tools : r.tools.length ? r.tools : [...TOOL_NAMES],
    });

  const names = roles.map((r) => r.name.trim().toLowerCase()).filter(Boolean);
  const dupName = names.length !== new Set(names).size;
  const emptyName = roles.some((r) => !r.name.trim());

  return (
    <div className="space-y-4">
      {roles.length === 0 && (
        <Warn>
          No roles yet. Define a role — a reusable set of tools and command rules — then assign
          users to it below. Users inherit their role&apos;s permissions.
        </Warn>
      )}

      <div className="space-y-4">
        {roles.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Field label="Role name" hint="Users reference this; becomes a WINREACH_ROLES key.">
                  <TextInput value={r.name} onChange={(v) => update(r.id, { name: v })} placeholder="deployer" mono />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => remove(r.id)}
                className="mt-7 shrink-0 text-xs font-medium text-danger hover:underline"
              >
                Remove
              </button>
            </div>

            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <div>
                <div className="mb-2">
                  <Toggle
                    checked={r.allTools}
                    onChange={(v) => setAllTools(r, v)}
                    label="All tools"
                    description="On = every tool (no tools restriction). Off = choose specific tools."
                  />
                </div>
                {!r.allTools && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {TOOL_NAMES.map((tool) => (
                      <label key={tool} className="flex items-center gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          checked={r.tools.includes(tool)}
                          onChange={() => toggleTool(r, tool)}
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
                  <TextArea value={r.allow} onChange={(v) => update(r.id, { allow: v })} placeholder={"^Get-\n^Test-"} />
                </Field>
                <Field label="Command denylist">
                  <TextArea value={r.deny} onChange={(v) => update(r.id, { deny: v })} placeholder={"Remove-Item\nFormat-Volume"} />
                </Field>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border-strong bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-muted"
      >
        + Add role
      </button>

      {emptyName && <Warn>Every role needs a name so users can reference it.</Warn>}
      {dupName && <Warn>Two roles share a name. Give each a distinct name.</Warn>}
    </div>
  );
}
