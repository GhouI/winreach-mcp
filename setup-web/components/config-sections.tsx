"use client";

// The five editable configuration groups, shared between onboarding (one per
// stage) and the dashboard's Configuration view (stacked). All state lives in
// the page and flows in via `form` / `set`.

import { generateToken, parseList } from "@/lib/winbridge-config";
import type { FormState } from "@/lib/form-state";
import { Disclosure, Field, Grid, Section, TextArea, TextInput, Toggle, Warn, btnSecondary } from "@/components/ui";
import { UsersEditor } from "@/components/users-editor";

export type SetField = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

type SectionProps = {
  form: FormState;
  set: SetField;
  eyebrow?: string;
  /** Drop the card chrome — the parent (e.g. a checklist item) carries the title. */
  frameless?: boolean;
};

/** Derived validation flags used by sections, the stage rail, and review. */
export function formWarnings(form: FormState) {
  const tlsIncomplete =
    (!!form.certPath.trim() || !!form.keyPath.trim()) &&
    !(form.certPath.trim() && form.keyPath.trim());
  const fileEnabledNoRoot = form.fileEnabled && !form.fileRoot.trim();
  const exposedNoIps =
    form.host.trim() === "0.0.0.0" && parseList(form.allowedIps).length === 0;
  const usersNoneYet = form.authMode === "users" && form.users.length === 0;
  const tokenMissing = form.authMode === "single" && !form.token.trim();
  return { tlsIncomplete, fileEnabledNoRoot, exposedNoIps, usersNoneYet, tokenMissing };
}

/* ------------------------------ 01 · Server ------------------------------- */

export function ServerSection({ form, set, eyebrow, frameless }: SectionProps) {
  const { exposedNoIps } = formWarnings(form);
  const ipCount = parseList(form.allowedIps).length;
  const originCount = parseList(form.allowedOrigins).length;
  const advancedCount = ipCount + originCount;
  // Open by default when there's something to show or a network-exposure nudge.
  const advancedOpen = advancedCount > 0 || exposedNoIps;
  const advancedHint = advancedCount > 0 ? `${advancedCount} set` : "optional";
  return (
    <Section
      eyebrow={eyebrow}
      frameless={frameless}
      title="Server"
      desc="Where WinBridge binds, its endpoint, and which networks may reach it."
    >
      <Grid>
        <Field label="Bind host" hint="127.0.0.1 unless behind a firewall or tunnel.">
          <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="127.0.0.1" mono />
        </Field>
        <Field label="Port">
          <TextInput value={form.port} onChange={(v) => set("port", v)} placeholder="7573" inputMode="numeric" mono />
        </Field>
        <Field label="Endpoint path">
          <TextInput value={form.endpointPath} onChange={(v) => set("endpointPath", v)} placeholder="/mcp" mono />
        </Field>
        <Field label="Cloudflare tunnel" hint="Publish over a quick tunnel." asDiv>
          <Toggle checked={form.tunnel} onChange={(v) => set("tunnel", v)} label="Enable tunnel" />
        </Field>
      </Grid>

      <Disclosure summary="Advanced options" hint={advancedHint} defaultOpen={advancedOpen}>
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          Network scoping. Both are optional and comma or newline separated — leave blank to
          skip. Restricting these narrows who can reach the server and which browser origins
          it will answer.
        </p>
        <Grid>
          <Field
            label="Allowed source IPs / CIDRs"
            hint="Corporate ranges. Used for the generated Windows firewall rule."
          >
            <TextArea value={form.allowedIps} onChange={(v) => set("allowedIps", v)} placeholder={"10.0.0.0/8\n203.0.113.5"} />
          </Field>
          <Field label="Allowed origins" hint="Restricts the Origin header (browser clients).">
            <TextArea value={form.allowedOrigins} onChange={(v) => set("allowedOrigins", v)} placeholder={"https://app.example.com\nhttps://admin.example.com"} />
          </Field>
        </Grid>
      </Disclosure>

      {exposedNoIps && (
        <Warn>
          Binding to 0.0.0.0 with no allowed IPs exposes the port to everyone. Add your
          corporate ranges above, or use a tunnel.
        </Warn>
      )}
    </Section>
  );
}

/* ----------------------------- 02 · Security ------------------------------ */

export function SecuritySection({ form, set, eyebrow, frameless }: SectionProps) {
  const { tlsIncomplete } = formWarnings(form);
  return (
    <Section
      eyebrow={eyebrow}
      frameless={frameless}
      title="TLS / mTLS"
      desc="Serve HTTPS in-app (optional). mTLS additionally requires a client CA."
    >
      <Grid>
        <Field label="TLS cert path">
          <TextInput value={form.certPath} onChange={(v) => set("certPath", v)} placeholder="C:\certs\server-cert.pem" mono />
        </Field>
        <Field label="TLS key path">
          <TextInput value={form.keyPath} onChange={(v) => set("keyPath", v)} placeholder="C:\certs\server-key.pem" mono />
        </Field>
        <Field label="Client CA (mTLS)" hint="Requires cert + key.">
          <TextInput value={form.clientCaPath} onChange={(v) => set("clientCaPath", v)} placeholder="C:\certs\client-ca.pem" mono />
        </Field>
      </Grid>
      {tlsIncomplete && <Warn>TLS needs both a cert and a key. Set both, or clear them.</Warn>}
    </Section>
  );
}

/* ------------------------------- 03 · Tools ------------------------------- */

export function ToolsSection({ form, set, eyebrow, frameless }: SectionProps) {
  const { fileEnabledNoRoot } = formWarnings(form);
  return (
    <Section
      eyebrow={eyebrow}
      frameless={frameless}
      title="Tools"
      desc="powershell_* tools are always on. These extra tools are opt-in."
    >
      <div className="rounded-md border border-border bg-background/60 p-4">
        <Toggle
          checked={form.screenshotEnabled}
          onChange={(v) => set("screenshotEnabled", v)}
          label="take_screenshot"
          description="Capture the interactive desktop and return it to the agent."
        />
        {form.screenshotEnabled && (
          <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-5 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Allowed roles" hint="Blank = any principal.">
              <TextInput value={form.screenshotRoles} onChange={(v) => set("screenshotRoles", v)} placeholder="admin, operator" />
            </Field>
            <Field label="Retention (hours)" hint="0 = keep forever.">
              <TextInput value={form.retentionHours} onChange={(v) => set("retentionHours", v)} inputMode="numeric" placeholder="8" mono />
            </Field>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-background/60 p-4">
        <Toggle
          checked={form.fileEnabled}
          onChange={(v) => set("fileEnabled", v)}
          label="file_upload / file_download"
          description="Transfer files inside a sandboxed root directory."
        />
        {form.fileEnabled && (
          <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-5 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="File root (sandbox)" hint="Required. All transfers stay inside this dir.">
              <TextInput value={form.fileRoot} onChange={(v) => set("fileRoot", v)} placeholder="C:\winbridge-files" mono />
            </Field>
            <Field label="Max file size (MB)">
              <TextInput value={form.maxBytesMB} onChange={(v) => set("maxBytesMB", v)} inputMode="numeric" placeholder="75" mono />
            </Field>
          </div>
        )}
        {fileEnabledNoRoot && (
          <div className="mt-3">
            <Warn>File transfer needs a root directory, or the tools stay disabled.</Warn>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ------------------------------ 04 · Policy ------------------------------- */

export function PolicySection({ form, set, eyebrow, frameless }: SectionProps) {
  return (
    <Section
      eyebrow={eyebrow}
      frameless={frameless}
      title="Command policy"
      desc="Regex allow/deny for powershell_execute and sessions. Deny wins."
    >
      <Grid>
        <Field label="Allowlist" hint="Blank = allow all (subject to deny).">
          <TextArea value={form.allow} onChange={(v) => set("allow", v)} placeholder={"^Get-\n^Test-"} rows={4} />
        </Field>
        <Field label="Denylist">
          <TextArea value={form.deny} onChange={(v) => set("deny", v)} placeholder={"Remove-Item\nFormat-Volume"} rows={4} />
        </Field>
      </Grid>
    </Section>
  );
}

/* ------------------------------ 05 · Access ------------------------------- */

export function AccessSection({ form, set, eyebrow, frameless }: SectionProps) {
  return (
    <Section
      eyebrow={eyebrow}
      frameless={frameless}
      title="Authentication"
      desc="How agents authenticate against the server."
    >
      <Field label="Auth model" asDiv>
        <div className="flex flex-wrap gap-2">
          <ModeButton
            active={form.authMode === "single"}
            onClick={() => set("authMode", "single")}
            title="Single admin token"
            desc="One shared WINBRIDGE_TOKEN"
          />
          <ModeButton
            active={form.authMode === "users"}
            onClick={() => set("authMode", "users")}
            title="Multiple users"
            desc="Per-user keys, roles & tools"
          />
        </div>
      </Field>

      {form.authMode === "single" ? (
        <Field label="Bearer token (WINBRIDGE_TOKEN)" hint="Required. Use a long random value.">
          <div className="flex gap-2">
            <TextInput value={form.token} onChange={(v) => set("token", v)} placeholder="click Generate" mono />
            <button
              type="button"
              onClick={() => set("token", generateToken())}
              className={`${btnSecondary} shrink-0`}
            >
              Generate
            </button>
          </div>
        </Field>
      ) : (
        <Field
          label="Users"
          hint="Each user becomes a WINBRIDGE_PRINCIPALS entry with its own key, role, and tool/command limits."
          asDiv
        >
          <UsersEditor users={form.users} onChange={(users) => set("users", users)} />
        </Field>
      )}

      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
        These keys are written into the generated config. For database-backed accounts —
        hashed keys, rotation, enable/disable — use Accounts in the console once setup is
        complete.
      </p>
    </Section>
  );
}

function ModeButton({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-[180px] flex-1 rounded-md border px-4 py-3 text-left transition-colors ${
        active
          ? "border-foreground bg-surface-muted/60"
          : "border-border bg-surface hover:bg-surface-muted"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span
          aria-hidden
          className={`size-2 rounded-full ${active ? "bg-accent" : "border border-border-strong"}`}
        />
      </span>
      <span className="mt-0.5 block text-xs text-muted">{desc}</span>
    </button>
  );
}
