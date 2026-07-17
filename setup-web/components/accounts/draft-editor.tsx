"use client";

import { ROLE_PRESETS, TOOL_NAMES } from "@/lib/winreach-config";
import { Field, Grid, Select, TextArea, TextInput, Toggle } from "@/components/ui";
import { ROLES, type Draft } from "./types";

/** Shared form for a single account's permissions, used by create + edit. */
export function DraftEditor({
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
    <div className="space-y-5">
      <Grid>
        <Field label="Name">
          <TextInput value={draft.name} onChange={(v) => set({ name: v })} placeholder="alice" mono />
        </Field>
        <Field label="Role" hint="Presets fill tools & command rules; edit below.">
          <Select value={draft.role} onChange={setRole} options={ROLES} />
        </Field>
      </Grid>

      <div>
        <div className="mb-2">
          <Toggle
            checked={draft.allTools}
            onChange={(v) =>
              set({ allTools: v, tools: v ? draft.tools : draft.tools.length ? draft.tools : [...TOOL_NAMES] })
            }
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
                  className="size-3.5 accent-[var(--accent)]"
                />
                <span className="font-mono">{tool}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Grid>
        <Field label="Command allowlist" hint="Blank = allow all (subject to deny).">
          <TextArea value={draft.allow} onChange={(v) => set({ allow: v })} placeholder={"^Get-\n^Test-"} />
        </Field>
        <Field label="Command denylist">
          <TextArea value={draft.deny} onChange={(v) => set({ deny: v })} placeholder={"Remove-Item\nFormat-Volume"} />
        </Field>
      </Grid>

      {!hideEnabled && (
        <Toggle
          checked={draft.enabled}
          onChange={(v) => set({ enabled: v })}
          label="Enabled"
          description="Disabled keys are excluded from the principals export."
        />
      )}
    </div>
  );
}
