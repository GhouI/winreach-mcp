"use client";

import { useMemo, useState } from "react";
import {
  buildClaudeConfig,
  buildCodexConfig,
  buildFirewallRule,
  buildPowerShellEnv,
  buildStartScript,
  connectUrl,
  generateToken,
  parseList,
} from "@/lib/winbridge-config";
import {
  INITIAL,
  fromConfig,
  sanitizeConfig,
  toConfig,
  type FormState,
} from "@/lib/form-state";
import type { StoredConfig } from "@/lib/config-store";
import { Field, Grid, Section, TextArea, TextInput, Toggle, Warn } from "@/components/ui";
import { OutputPanel } from "@/components/output-panel";
import { Stepper } from "@/components/stepper";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  ClipboardCheckIcon,
  FilterIcon,
  KeyIcon,
  LockIcon,
  ServerIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
  TerminalIcon,
} from "@/components/icons";

const STEP_TITLES = ["Server", "Access", "Security", "Tools", "Policy", "Review"];

export default function Home() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [step, setStep] = useState(0);
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

  const flaggedSteps = [
    ...(exposedNoIps ? [0] : []),
    ...(tlsIncomplete ? [2] : []),
    ...(fileEnabledNoRoot ? [3] : []),
  ];

  const features = useMemo(() => {
    const list = ["powershell_*"];
    if (cfg.screenshot.enabled) list.push("take_screenshot");
    if (cfg.fileTransfer.enabled) list.push("file_transfer");
    if (cfg.tls.certPath && cfg.tls.keyPath)
      list.push(cfg.tls.clientCaPath ? "mTLS" : "TLS");
    if (cfg.tunnel) list.push("tunnel");
    return list;
  }, [cfg]);

  /* ---- Agent API sync (Review stage) ---- */
  const [setupKey, setSetupKey] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [sync, setSync] = useState<{ tone: "ok" | "err"; msg: string } | null>(null);

  const callConfigApi = async (method: "GET" | "PUT") => {
    setSyncBusy(true);
    setSync(null);
    try {
      const res = await fetch("/api/config", {
        method,
        headers: {
          authorization: `Bearer ${setupKey.trim()}`,
          ...(method === "PUT"
            ? { "content-type": "application/json", "x-updated-by": "web" }
            : {}),
        },
        body: method === "PUT" ? JSON.stringify({ config: cfg }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as
        | (Partial<StoredConfig> & { error?: string })
        | null;
      if (!res.ok) {
        setSync({ tone: "err", msg: data?.error ?? `Request failed (${res.status}).` });
        return;
      }
      if (method === "GET") {
        setForm(fromConfig(sanitizeConfig(data?.config)));
        const when = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "unknown time";
        setSync({
          tone: "ok",
          msg: `Loaded the saved configuration (last updated ${when} by ${data?.updatedBy ?? "unknown"}).`,
        });
      } else {
        setSync({
          tone: "ok",
          msg: "Configuration saved on this host. Agents with the setup key can now read and modify it.",
        });
      }
    } catch {
      setSync({ tone: "err", msg: "Could not reach the setup API on this host." });
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col">
      <div aria-hidden className="top-glow pointer-events-none absolute inset-x-0 top-0 h-80" />

      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
              <TerminalIcon className="size-4" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight">WinBridge MCP</span>
            <span aria-hidden className="text-faint">/</span>
            <span className="text-sm text-muted">Setup</span>
            <span className="ml-1 hidden rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted sm:inline-block">
              Config generator
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <LockIcon className="size-3.5" />
            <span className="hidden sm:inline">Generated in your browser</span>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:pt-14">
        {/* ---- Hero ---- */}
        <div className="mb-8 max-w-2xl lg:mb-10">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Set up your WinBridge server
          </h1>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            Walk through the stages to configure the server, choose which tools are
            exposed, and restrict access by IP. Output is generated locally as you
            type — copy it, review it, and apply it on your Windows host.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-8">
          {/* ---- Wizard (left) ---- */}
          <div className="min-w-0 space-y-5">
            <Stepper
              steps={STEP_TITLES}
              active={step}
              onSelect={setStep}
              flagged={flaggedSteps}
            />

            {/* Stage 1 — Server */}
            {step === 0 && (
              <Section
                icon={<ServerIcon className="size-4" />}
                title="Server"
                desc="Where WinBridge binds and its endpoint."
              >
                <Grid>
                  <Field label="Bind host" hint="127.0.0.1 unless behind a firewall/tunnel">
                    <TextInput value={form.host} onChange={(v) => set("host", v)} placeholder="127.0.0.1" mono />
                  </Field>
                  <Field label="Port">
                    <TextInput value={form.port} onChange={(v) => set("port", v)} placeholder="7573" inputMode="numeric" mono />
                  </Field>
                  <Field label="Endpoint path">
                    <TextInput value={form.endpointPath} onChange={(v) => set("endpointPath", v)} placeholder="/mcp" mono />
                  </Field>
                  <Field label="Cloudflare tunnel" hint="Publish over a quick tunnel" asDiv>
                    <Toggle checked={form.tunnel} onChange={(v) => set("tunnel", v)} label="Enable tunnel" />
                  </Field>
                </Grid>
                {exposedNoIps && (
                  <Warn>
                    Binding to 0.0.0.0 with no allowed IPs exposes the port to everyone.
                    Add corporate IP ranges in the Access stage or use a tunnel.
                  </Warn>
                )}
              </Section>
            )}

            {/* Stage 2 — Access */}
            {step === 1 && (
              <Section
                icon={<KeyIcon className="size-4" />}
                title="Authentication & access"
                desc="Bearer token and who may reach the server."
              >
                <Field label="Bearer token (WINBRIDGE_TOKEN)" hint="Required. Use a long random value.">
                  <div className="flex gap-2">
                    <TextInput value={form.token} onChange={(v) => set("token", v)} placeholder="click Generate" mono />
                    <button
                      type="button"
                      onClick={() => set("token", generateToken())}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-sm transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    >
                      <SparklesIcon className="size-3.5" />
                      Generate
                    </button>
                  </div>
                </Field>
                <Field
                  label="Allowed source IPs / CIDRs"
                  hint="Corporate ranges, comma or newline separated. Used for the firewall rule."
                >
                  <TextArea value={form.allowedIps} onChange={(v) => set("allowedIps", v)} placeholder={"10.0.0.0/8\n203.0.113.5"} />
                </Field>
                <Field label="Allowed Origins" hint="Optional. Restricts the Origin header (browser clients).">
                  <TextInput value={form.allowedOrigins} onChange={(v) => set("allowedOrigins", v)} placeholder="https://app.example.com" mono />
                </Field>
              </Section>
            )}

            {/* Stage 3 — Security (TLS / mTLS) */}
            {step === 2 && (
              <Section
                icon={<ShieldIcon className="size-4" />}
                title="TLS / mTLS"
                desc="Serve HTTPS in-app (optional). mTLS also requires a client CA."
              >
                <Grid>
                  <Field label="TLS cert path">
                    <TextInput value={form.certPath} onChange={(v) => set("certPath", v)} placeholder="C:\certs\server-cert.pem" mono />
                  </Field>
                  <Field label="TLS key path">
                    <TextInput value={form.keyPath} onChange={(v) => set("keyPath", v)} placeholder="C:\certs\server-key.pem" mono />
                  </Field>
                  <Field label="Client CA (mTLS)" hint="Requires cert + key">
                    <TextInput value={form.clientCaPath} onChange={(v) => set("clientCaPath", v)} placeholder="C:\certs\client-ca.pem" mono />
                  </Field>
                </Grid>
                {tlsIncomplete && <Warn>TLS needs both a cert and a key. Set both, or clear them.</Warn>}
              </Section>
            )}

            {/* Stage 4 — Tools */}
            {step === 3 && (
              <Section
                icon={<SlidersIcon className="size-4" />}
                title="Tools"
                desc="powershell_* tools are always on. These extra tools are opt-in."
              >
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <Toggle
                    checked={form.screenshotEnabled}
                    onChange={(v) => set("screenshotEnabled", v)}
                    label="take_screenshot"
                    description="Capture the interactive desktop and return it to the agent."
                  />
                  {form.screenshotEnabled && (
                    <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-5 border-t border-border pt-4 sm:grid-cols-2">
                      <Field label="Allowed roles" hint="Blank = any principal">
                        <TextInput value={form.screenshotRoles} onChange={(v) => set("screenshotRoles", v)} placeholder="admin, operator" />
                      </Field>
                      <Field label="Retention (hours)" hint="0 = keep forever">
                        <TextInput value={form.retentionHours} onChange={(v) => set("retentionHours", v)} inputMode="numeric" placeholder="8" mono />
                      </Field>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <Toggle
                    checked={form.fileEnabled}
                    onChange={(v) => set("fileEnabled", v)}
                    label="file_upload / file_download"
                    description="Transfer files inside a sandboxed root directory."
                  />
                  {form.fileEnabled && (
                    <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-5 border-t border-border pt-4 sm:grid-cols-2">
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
            )}

            {/* Stage 5 — Policy */}
            {step === 4 && (
              <Section
                icon={<FilterIcon className="size-4" />}
                title="Command policy"
                desc="Regex allow/deny for powershell_execute & sessions. Deny wins."
              >
                <Grid>
                  <Field label="Allowlist" hint="Blank = allow all (subject to deny)">
                    <TextArea value={form.allow} onChange={(v) => set("allow", v)} placeholder={"^Get-\n^Test-"} rows={4} />
                  </Field>
                  <Field label="Denylist">
                    <TextArea value={form.deny} onChange={(v) => set("deny", v)} placeholder={"Remove-Item\nFormat-Volume"} rows={4} />
                  </Field>
                </Grid>
              </Section>
            )}

            {/* Stage 6 — Review */}
            {step === 5 && (
              <>
                <Section
                  icon={<ClipboardCheckIcon className="size-4" />}
                  title="Review"
                  desc="A summary of everything this configuration enables."
                >
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    <SummaryRow label="Connect URL" value={connectUrl(cfg)} mono wide />
                    <SummaryRow label="Bind" value={`${cfg.host}:${cfg.port}`} mono />
                    <SummaryRow label="Endpoint path" value={cfg.endpointPath} mono />
                    <SummaryRow
                      label="Transport"
                      value={
                        cfg.tls.certPath && cfg.tls.keyPath
                          ? cfg.tls.clientCaPath
                            ? "HTTPS + mTLS"
                            : "HTTPS (TLS)"
                          : "HTTP"
                      }
                    />
                    <SummaryRow label="Cloudflare tunnel" value={cfg.tunnel ? "Enabled" : "Off"} />
                    <SummaryRow
                      label="Bearer token"
                      value={form.token.trim() ? `Set (${form.token.trim().length} chars)` : "Not set — see the Access stage"}
                    />
                    <SummaryRow
                      label="Firewall scope"
                      value={
                        cfg.allowedIps.length > 0
                          ? `${cfg.allowedIps.length} allowed ${cfg.allowedIps.length === 1 ? "range" : "ranges"}`
                          : "Any (unrestricted)"
                      }
                    />
                    <SummaryRow label="Tools" value={features.filter((f) => !["TLS", "mTLS", "tunnel"].includes(f)).join(", ")} mono wide />
                    <SummaryRow
                      label="Command policy"
                      value={`${cfg.policy.allow.length} allow / ${cfg.policy.deny.length} deny rules`}
                    />
                  </dl>

                  {(exposedNoIps || tlsIncomplete || fileEnabledNoRoot) && (
                    <div className="space-y-2">
                      {exposedNoIps && (
                        <Warn>Binding to 0.0.0.0 with no allowed IPs exposes the port to everyone.</Warn>
                      )}
                      {tlsIncomplete && <Warn>TLS needs both a cert and a key. Set both, or clear them.</Warn>}
                      {fileEnabledNoRoot && (
                        <Warn>File transfer needs a root directory, or the tools stay disabled.</Warn>
                      )}
                    </div>
                  )}
                </Section>

                <Section
                  icon={<BotIcon className="size-4" />}
                  title="Agent access"
                  desc="Save this configuration on the host so agents holding the setup key can read and modify it over HTTP."
                >
                  <div className="overflow-x-auto rounded-lg border border-border bg-background/60 p-3 font-mono text-xs leading-6 text-muted code-scroll">
                    <p><span className="text-accent">GET</span>&nbsp;&nbsp;/api/config</p>
                    <p><span className="text-accent">PUT</span>&nbsp;&nbsp;/api/config</p>
                    <p>Authorization: Bearer &lt;WINBRIDGE_SETUP_KEY&gt;</p>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    The endpoint stays disabled until the <code className="font-mono">WINBRIDGE_SETUP_KEY</code>{" "}
                    environment variable is set on the host running this app. Enter the same
                    key below to save or load the shared configuration.
                  </p>
                  <Field label="Setup key" hint="Must match WINBRIDGE_SETUP_KEY on this host.">
                    <TextInput value={setupKey} onChange={setSetupKey} placeholder="paste your setup key" mono />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={syncBusy || !setupKey.trim()}
                      onClick={() => callConfigApi("PUT")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Save to host
                    </button>
                    <button
                      type="button"
                      disabled={syncBusy || !setupKey.trim()}
                      onClick={() => callConfigApi("GET")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Load saved config
                    </button>
                    {syncBusy && <span className="text-xs text-muted">Working…</span>}
                  </div>
                  {sync && (
                    <p
                      role="status"
                      className={`text-xs leading-relaxed ${
                        sync.tone === "ok"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {sync.msg}
                    </p>
                  )}
                </Section>
              </>
            )}

            {/* ---- Stage navigation ---- */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-sm font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeftIcon className="size-3.5" />
                Back
              </button>
              <span className="text-xs tabular-nums text-faint">
                Stage {step + 1} of {STEP_TITLES.length}
              </span>
              {step < STEP_TITLES.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEP_TITLES.length - 1, s + 1))}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Continue
                  <ArrowRightIcon className="size-3.5" />
                </button>
              ) : (
                <span aria-hidden className="w-[88px]" />
              )}
            </div>
          </div>

          {/* ---- Live output (right) ---- */}
          <div className="min-w-0 lg:sticky lg:top-[4.5rem] lg:h-fit">
            <OutputPanel tabs={tabs} connect={connectUrl(cfg)} features={features} />
          </div>
        </div>
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl space-y-1.5 px-4 py-6 text-xs leading-relaxed text-muted sm:px-6">
          <p>
            Generated config is not applied automatically. Review it, then set the env
            vars and run WinBridge on your host.
          </p>
          <p>
            Source-IP filtering here is enforced via the generated Windows firewall
            rule — WinBridge does not yet filter IPs in-app. The optional agent API
            only stores this setup document; it never starts or reconfigures a
            running server.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------ Review rows ------------------------------ */

function SummaryRow({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 break-all text-[13px] ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
