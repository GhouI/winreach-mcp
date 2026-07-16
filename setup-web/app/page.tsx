"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_CONFIG,
  buildClaudeConfig,
  buildCodexConfig,
  buildFirewallRule,
  buildPowerShellEnv,
  buildStartScript,
  connectUrl,
  generateToken,
  parseList,
  type WinBridgeConfig,
} from "@/lib/winbridge-config";

type FormState = {
  host: string;
  port: string;
  endpointPath: string;
  token: string;
  allowedOrigins: string;
  screenshotEnabled: boolean;
  screenshotRoles: string;
  retentionHours: string;
  fileEnabled: boolean;
  fileRoot: string;
  maxBytesMB: string;
  allow: string;
  deny: string;
  certPath: string;
  keyPath: string;
  clientCaPath: string;
  allowedIps: string;
  tunnel: boolean;
};

const INITIAL: FormState = {
  host: DEFAULT_CONFIG.host,
  port: String(DEFAULT_CONFIG.port),
  endpointPath: DEFAULT_CONFIG.endpointPath,
  token: "",
  allowedOrigins: "",
  screenshotEnabled: false,
  screenshotRoles: "",
  retentionHours: "8",
  fileEnabled: false,
  fileRoot: "",
  maxBytesMB: "75",
  allow: "",
  deny: "",
  certPath: "",
  keyPath: "",
  clientCaPath: "",
  allowedIps: "",
  tunnel: false,
};

function toConfig(f: FormState): WinBridgeConfig {
  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    host: f.host.trim() || "127.0.0.1",
    port: num(f.port, 7573),
    endpointPath: f.endpointPath.trim() || "/mcp",
    token: f.token.trim(),
    allowedOrigins: parseList(f.allowedOrigins),
    screenshot: {
      enabled: f.screenshotEnabled,
      roles: parseList(f.screenshotRoles),
      retentionHours: num(f.retentionHours, 8),
    },
    fileTransfer: {
      enabled: f.fileEnabled,
      root: f.fileRoot.trim(),
      maxBytesMB: num(f.maxBytesMB, 75),
    },
    policy: { allow: parseList(f.allow), deny: parseList(f.deny) },
    tls: {
      certPath: f.certPath.trim(),
      keyPath: f.keyPath.trim(),
      clientCaPath: f.clientCaPath.trim(),
    },
    allowedIps: parseList(f.allowedIps),
    tunnel: f.tunnel,
  };
}

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const cfg = useMemo(() => toConfig(form), [form]);

  const tabs = useMemo(
    () => ({
      "Env (PowerShell)": buildPowerShellEnv(cfg),
      "start.ps1": buildStartScript(cfg),
      Firewall: buildFirewallRule(cfg),
      "Claude Code": buildClaudeConfig(cfg),
      Codex: buildCodexConfig(cfg),
    }),
    [cfg],
  );

  const tlsIncomplete =
    (!!form.certPath.trim() || !!form.keyPath.trim()) &&
    !(form.certPath.trim() && form.keyPath.trim());
  const fileEnabledNoRoot = form.fileEnabled && !form.fileRoot.trim();
  const exposedNoIps =
    form.host.trim() === "0.0.0.0" && parseList(form.allowedIps).length === 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          WinBridge MCP Setup
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-black/60 dark:text-white/60">
          Configure the server, choose which tools are exposed, and restrict
          access by IP. Everything is generated locally in your browser — copy
          the output, review it, and apply it on your Windows host.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(360px,460px)]">
        {/* ---- Form ---- */}
        <div className="space-y-5">
          <Section title="Server" desc="Where WinBridge binds and its endpoint.">
            <Grid>
              <Field label="Bind host" hint="127.0.0.1 unless behind a firewall/tunnel">
                <Text value={form.host} onChange={(v) => set("host", v)} placeholder="127.0.0.1" />
              </Field>
              <Field label="Port">
                <Text value={form.port} onChange={(v) => set("port", v)} placeholder="7573" inputMode="numeric" />
              </Field>
              <Field label="Endpoint path">
                <Text value={form.endpointPath} onChange={(v) => set("endpointPath", v)} placeholder="/mcp" />
              </Field>
              <Field label="Cloudflare tunnel" hint="Publish over a quick tunnel">
                <Toggle checked={form.tunnel} onChange={(v) => set("tunnel", v)} label="Enable tunnel" />
              </Field>
            </Grid>
            {exposedNoIps && (
              <Warn>Binding to 0.0.0.0 with no allowed IPs exposes the port to everyone. Add corporate IP ranges below or use a tunnel.</Warn>
            )}
          </Section>

          <Section title="Authentication & access" desc="Bearer token and who may reach the server.">
            <Field label="Bearer token (WINBRIDGE_TOKEN)" hint="Required. Use a long random value.">
              <div className="flex gap-2">
                <Text value={form.token} onChange={(v) => set("token", v)} placeholder="click Generate →" mono />
                <button
                  type="button"
                  onClick={() => set("token", generateToken())}
                  className="shrink-0 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-500"
                >
                  Generate
                </button>
              </div>
            </Field>
            <Field label="Allowed source IPs / CIDRs" hint="Corporate ranges, comma or newline separated. Used for the firewall rule.">
              <Area value={form.allowedIps} onChange={(v) => set("allowedIps", v)} placeholder={"10.0.0.0/8\n203.0.113.5"} />
            </Field>
            <Field label="Allowed Origins" hint="Optional. Restricts the Origin header (browser clients).">
              <Text value={form.allowedOrigins} onChange={(v) => set("allowedOrigins", v)} placeholder="https://app.example.com" />
            </Field>
          </Section>

          <Section title="TLS / mTLS" desc="Serve HTTPS in-app (optional). mTLS also requires a client CA.">
            <Grid>
              <Field label="TLS cert path">
                <Text value={form.certPath} onChange={(v) => set("certPath", v)} placeholder="C:\\certs\\server-cert.pem" mono />
              </Field>
              <Field label="TLS key path">
                <Text value={form.keyPath} onChange={(v) => set("keyPath", v)} placeholder="C:\\certs\\server-key.pem" mono />
              </Field>
              <Field label="Client CA (mTLS)" hint="Requires cert + key">
                <Text value={form.clientCaPath} onChange={(v) => set("clientCaPath", v)} placeholder="C:\\certs\\client-ca.pem" mono />
              </Field>
            </Grid>
            {tlsIncomplete && <Warn>TLS needs both a cert and a key. Set both, or clear them.</Warn>}
          </Section>

          <Section title="Tools" desc="powershell_* tools are always on. These extra tools are opt-in.">
            <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <Toggle checked={form.screenshotEnabled} onChange={(v) => set("screenshotEnabled", v)} label="take_screenshot" />
              {form.screenshotEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Allowed roles" hint="Blank = any principal">
                    <Text value={form.screenshotRoles} onChange={(v) => set("screenshotRoles", v)} placeholder="admin, operator" />
                  </Field>
                  <Field label="Retention (hours)" hint="0 = keep forever">
                    <Text value={form.retentionHours} onChange={(v) => set("retentionHours", v)} inputMode="numeric" placeholder="8" />
                  </Field>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
              <Toggle checked={form.fileEnabled} onChange={(v) => set("fileEnabled", v)} label="file_upload / file_download" />
              {form.fileEnabled && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="File root (sandbox)" hint="Required. All transfers stay inside this dir.">
                    <Text value={form.fileRoot} onChange={(v) => set("fileRoot", v)} placeholder="C:\\winbridge-files" mono />
                  </Field>
                  <Field label="Max file size (MB)">
                    <Text value={form.maxBytesMB} onChange={(v) => set("maxBytesMB", v)} inputMode="numeric" placeholder="75" />
                  </Field>
                </div>
              )}
              {fileEnabledNoRoot && <Warn>File transfer needs a root directory, or the tools stay disabled.</Warn>}
            </div>
          </Section>

          <Section title="Command policy" desc="Regex allow/deny for powershell_execute & sessions. Deny wins.">
            <Grid>
              <Field label="Allowlist" hint="Blank = allow all (subject to deny)">
                <Area value={form.allow} onChange={(v) => set("allow", v)} placeholder={"^Get-\n^Test-"} />
              </Field>
              <Field label="Denylist">
                <Area value={form.deny} onChange={(v) => set("deny", v)} placeholder={"Remove-Item\nFormat-Volume"} />
              </Field>
            </Grid>
          </Section>
        </div>

        {/* ---- Output ---- */}
        <div className="lg:sticky lg:top-6 lg:h-fit">
          <OutputPanel tabs={tabs} connect={connectUrl(cfg)} />
        </div>
      </div>

      <footer className="mt-10 border-t border-black/10 pt-4 text-xs text-black/50 dark:border-white/10 dark:text-white/50">
        Generated config is not applied automatically. Review it, then set the env vars and run WinBridge on your host.
        Note: source-IP filtering here is enforced via the generated Windows firewall rule (WinBridge does not yet filter IPs in-app).
      </footer>
    </div>
  );
}

/* ---------------- UI primitives ---------------- */

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.02]">
      <h2 className="text-base font-semibold">{title}</h2>
      {desc && <p className="mt-0.5 text-xs text-black/50 dark:text-white/50">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="ml-1 text-xs text-black/40 dark:text-white/40">— {hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass =
  "w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-white/15 dark:bg-black/30";

function Text({
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <input
      type="text"
      value={value}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${mono ? "font-mono" : ""}`}
    />
  );
}

function Area({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className={`${inputClass} resize-y font-mono`}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-blue-600" : "bg-black/20 dark:bg-white/20"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
      <span className="font-mono text-sm">{label}</span>
    </button>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      ⚠ {children}
    </p>
  );
}

function OutputPanel({ tabs, connect }: { tabs: Record<string, string>; connect: string }) {
  const names = Object.keys(tabs);
  const [active, setActive] = useState(names[0]);
  const [copied, setCopied] = useState(false);
  const current = tabs[active] ?? "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  return (
    <div className="rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02]">
      <div className="border-b border-black/10 px-4 pt-3 dark:border-white/10">
        <p className="text-xs text-black/50 dark:text-white/50">Connect URL</p>
        <p className="truncate font-mono text-sm">{connect}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setActive(n)}
              className={`rounded-t-md px-2.5 py-1.5 text-xs font-medium transition ${
                active === n
                  ? "bg-black/10 dark:bg-white/10"
                  : "text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={copy}
          className="absolute right-3 top-3 rounded-md bg-black/10 px-2 py-1 text-xs font-medium hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <pre className="max-h-[60vh] overflow-auto p-4 pt-12 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
          {current || "—"}
        </pre>
      </div>
    </div>
  );
}
