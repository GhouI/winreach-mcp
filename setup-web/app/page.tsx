"use client";

// The whole app lives at "/".
//
//   First run   -> inline onboarding: six numbered stages that build the
//                  server configuration, with accounts/auth at the end.
//   Configured  -> the console (dashboard): Configuration, Accounts,
//                  Agent access, and Database panels.
//
// Completion + the working configuration persist in localStorage; the config
// itself round-trips through sanitizeConfig so stored JSON can never break
// the editor. All server contracts (/api/*) are unchanged.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildClaudeConfig,
  buildCodexConfig,
  buildFirewallRule,
  buildPowerShellEnv,
  buildPrincipalsJson,
  buildStartScript,
  connectUrl,
  type WinBridgeConfig,
} from "@/lib/winbridge-config";
import {
  INITIAL,
  fromConfig,
  sanitizeConfig,
  toConfig,
  type FormState,
} from "@/lib/form-state";
import { Section, Warn, btnPrimary, btnSecondary } from "@/components/ui";
import { OutputPanel } from "@/components/output-panel";
import { StageRail } from "@/components/stepper";
import {
  AccessSection,
  PolicySection,
  SecuritySection,
  ServerSection,
  ToolsSection,
  formWarnings,
  type SetField,
} from "@/components/config-sections";
import { AccountsPanel, type Boot } from "@/components/accounts-panel";
import { AgentAccessPanel } from "@/components/agent-access-panel";
import { DatabasePanel } from "@/components/database-panel";

const CONFIG_KEY = "winbridge.setup.v1";
const ONBOARD_KEY = "winbridge.onboarded.v1";

const STAGES = ["Server", "Security", "Tools", "Policy", "Access", "Review"];

type Phase = "loading" | "onboarding" | "dashboard";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<FormState>(INITIAL);
  const [boot, setBoot] = useState<Boot | null>(null);

  const set: SetField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const cfg = useMemo(() => toConfig(form), [form]);

  // Hydrate the saved configuration + phase. localStorage is browser-only, so
  // this must run after hydration; the microtask keeps the effect body free of
  // synchronous setState (react-hooks/set-state-in-effect) while still
  // resolving before the next paint in practice.
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) setForm(fromConfig(sanitizeConfig(JSON.parse(raw))));
      } catch {
        /* corrupted store — start fresh */
      }
      let onboarded = false;
      try {
        onboarded = localStorage.getItem(ONBOARD_KEY) === "1";
      } catch {
        /* storage unavailable */
      }
      setPhase(onboarded ? "dashboard" : "onboarding");
    });
  }, []);

  // Persist the working configuration as it changes.
  useEffect(() => {
    if (phase === "loading") return;
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    } catch {
      /* storage unavailable */
    }
  }, [cfg, phase]);

  // Account-store bootstrap state, needed by the console.
  const refreshBoot = useCallback(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setBoot(d as Boot))
      .catch(() => setBoot(null));
  }, []);
  useEffect(() => {
    if (phase === "dashboard") refreshBoot();
  }, [phase, refreshBoot]);

  const tabs = useMemo(() => {
    const t: Record<string, string> = {};
    t["Env (PowerShell)"] = buildPowerShellEnv(cfg);
    if (cfg.authMode === "users") t["Principals"] = buildPrincipalsJson(cfg);
    t["start.ps1"] = buildStartScript(cfg);
    t["Firewall"] = buildFirewallRule(cfg);
    t["Claude Code"] = buildClaudeConfig(cfg);
    t["Codex"] = buildCodexConfig(cfg);
    return t;
  }, [cfg]);

  const features = useMemo(() => {
    const list = ["powershell_*"];
    if (cfg.screenshot.enabled) list.push("take_screenshot");
    if (cfg.fileTransfer.enabled) list.push("file_transfer");
    if (cfg.tls.certPath && cfg.tls.keyPath)
      list.push(cfg.tls.clientCaPath ? "mTLS" : "TLS");
    if (cfg.tunnel) list.push("tunnel");
    return list;
  }, [cfg]);

  const finishSetup = () => {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setPhase("dashboard");
  };

  const restartSetup = () => {
    try {
      localStorage.removeItem(ONBOARD_KEY);
    } catch {
      /* storage unavailable */
    }
    setPhase("onboarding");
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="size-2.5 shrink-0 bg-accent" />
            <span className="truncate text-sm font-semibold tracking-tight">WinBridge</span>
            <span className="text-sm text-faint">MCP</span>
          </div>
          <span className="eyebrow">
            {phase === "dashboard" ? "Console" : phase === "onboarding" ? "Setup" : ""}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 lg:pt-12">
        {phase === "onboarding" && (
          <Onboarding
            form={form}
            set={set}
            cfg={cfg}
            features={features}
            onFinish={finishSetup}
          />
        )}
        {phase === "dashboard" && (
          <Dashboard
            form={form}
            set={set}
            setForm={setForm}
            cfg={cfg}
            tabs={tabs}
            features={features}
            boot={boot}
            refreshBoot={refreshBoot}
            onRestart={restartSetup}
          />
        )}
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-xs leading-relaxed text-muted sm:px-6">
          <p>Nothing is applied automatically — review the generated config and run WinBridge on your host.</p>
        </div>
      </footer>
    </div>
  );
}

/* ============================== Onboarding =============================== */

function Onboarding({
  form,
  set,
  cfg,
  features,
  onFinish,
}: {
  form: FormState;
  set: SetField;
  cfg: WinBridgeConfig;
  features: string[];
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const w = formWarnings(form);
  const flagged = [
    ...(w.exposedNoIps ? [0] : []),
    ...(w.tlsIncomplete ? [1] : []),
    ...(w.fileEnabledNoRoot ? [2] : []),
    ...(w.usersNoneYet || w.tokenMissing ? [4] : []),
  ];
  const last = STAGES.length - 1;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* ---- Hero ---- */}
      <div className="mb-2">
        <p className="eyebrow mb-3">Initial setup</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          Configure your WinBridge server
        </h1>
      </div>

      <StageRail steps={STAGES} active={step} onSelect={setStep} flagged={flagged} />

      {step === 0 && <ServerSection form={form} set={set} eyebrow="Stage 01" />}
      {step === 1 && <SecuritySection form={form} set={set} eyebrow="Stage 02" />}
      {step === 2 && <ToolsSection form={form} set={set} eyebrow="Stage 03" />}
      {step === 3 && <PolicySection form={form} set={set} eyebrow="Stage 04" />}
      {step === 4 && <AccessSection form={form} set={set} eyebrow="Stage 05" />}
      {step === 5 && <ReviewSection form={form} cfg={cfg} features={features} />}

      {/* ---- Stage navigation ---- */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className={btnSecondary}
        >
          Back
        </button>
        <span className="font-mono text-[11px] tabular-nums tracking-[0.08em] text-faint">
          {String(step + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
        </span>
        {step < last ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(last, s + 1))}
            className={btnPrimary}
          >
            Continue
          </button>
        ) : (
          <button type="button" onClick={onFinish} className={btnPrimary}>
            Finish setup
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Review ---------------------------------- */

function ReviewSection({
  form,
  cfg,
  features,
}: {
  form: FormState;
  cfg: WinBridgeConfig;
  features: string[];
}) {
  const w = formWarnings(form);
  return (
    <Section
      eyebrow="Stage 06"
      title="Review"
      desc="A summary of everything this configuration enables."
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
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
          label="Access model"
          value={
            cfg.authMode === "users"
              ? `${cfg.users.length} user${cfg.users.length === 1 ? "" : "s"} (per-user keys)`
              : form.token.trim()
                ? `Single token (${form.token.trim().length} chars)`
                : "Single token — not set"
          }
        />
        <SummaryRow
          label="Firewall scope"
          value={
            cfg.allowedIps.length > 0
              ? `${cfg.allowedIps.length} allowed ${cfg.allowedIps.length === 1 ? "range" : "ranges"}`
              : "Any (unrestricted)"
          }
        />
        <SummaryRow
          label="Tools"
          value={features.filter((f) => !["TLS", "mTLS", "tunnel"].includes(f)).join(", ")}
          mono
          wide
        />
        <SummaryRow
          label="Command policy"
          value={`${cfg.policy.allow.length} allow / ${cfg.policy.deny.length} deny rules`}
        />
      </dl>

      {(w.exposedNoIps || w.tlsIncomplete || w.fileEnabledNoRoot || w.usersNoneYet || w.tokenMissing) && (
        <div className="space-y-2">
          {w.exposedNoIps && (
            <Warn>Binding to 0.0.0.0 with no allowed IPs exposes the port to everyone.</Warn>
          )}
          {w.tlsIncomplete && <Warn>TLS needs both a cert and a key. Set both, or clear them.</Warn>}
          {w.fileEnabledNoRoot && (
            <Warn>File transfer needs a root directory, or the tools stay disabled.</Warn>
          )}
          {w.usersNoneYet && <Warn>Multi-user mode has no users yet. Add at least one in Access.</Warn>}
          {w.tokenMissing && <Warn>No bearer token set. Generate one in Access.</Warn>}
        </div>
      )}

      <p className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
        After finishing, the console opens on this page: edit any of this configuration,
        manage database-backed accounts, and save the config to this host for agents.
      </p>
    </Section>
  );
}

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

/* =============================== Dashboard =============================== */

type View = "config" | "accounts" | "agent" | "database";

const VIEWS: { id: View; label: string }[] = [
  { id: "config", label: "Configuration" },
  { id: "accounts", label: "Accounts" },
  { id: "agent", label: "Agent access" },
  { id: "database", label: "Database" },
];

function Dashboard({
  form,
  set,
  setForm,
  cfg,
  tabs,
  features,
  boot,
  refreshBoot,
  onRestart,
}: {
  form: FormState;
  set: SetField;
  setForm: (f: FormState) => void;
  cfg: WinBridgeConfig;
  tabs: Record<string, string>;
  features: string[];
  boot: Boot | null;
  refreshBoot: () => void;
  onRestart: () => void;
}) {
  const [view, setView] = useState<View>("config");

  const transport =
    cfg.tls.certPath && cfg.tls.keyPath
      ? cfg.tls.clientCaPath
        ? "HTTPS + mTLS"
        : "HTTPS"
      : "HTTP";
  const access =
    cfg.authMode === "users"
      ? `${cfg.users.length} user${cfg.users.length === 1 ? "" : "s"}`
      : "single token";

  return (
    <>
      {/* ---- Masthead ---- */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="eyebrow mb-3">Console</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
            WinBridge server
          </h1>
          <p className="mt-2.5 break-all font-mono text-[12.5px] leading-relaxed text-muted">
            {connectUrl(cfg)}
            <span className="mx-2 text-faint" aria-hidden>·</span>
            {transport}
            <span className="mx-2 text-faint" aria-hidden>·</span>
            {access}
          </p>
        </div>
        <button
          type="button"
          onClick={onRestart}
          className="shrink-0 text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          Run setup again
        </button>
      </div>

      {/* ---- Section nav ---- */}
      <nav
        aria-label="Console sections"
        className="mb-8 flex gap-6 overflow-x-auto border-b border-border code-scroll"
      >
        {VIEWS.map((v) => {
          const isActive = view === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative shrink-0 whitespace-nowrap pb-3 text-sm transition-colors ${
                isActive ? "font-medium text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {v.label}
              {isActive && (
                <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ---- Views ---- */}
      {view === "config" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
          <div className="min-w-0 space-y-5">
            <ServerSection form={form} set={set} />
            <SecuritySection form={form} set={set} />
            <ToolsSection form={form} set={set} />
            <PolicySection form={form} set={set} />
            <AccessSection form={form} set={set} />
          </div>
          <div className="min-w-0 lg:sticky lg:top-[4.5rem] lg:h-fit">
            <OutputPanel tabs={tabs} connect={connectUrl(cfg)} features={features} />
          </div>
        </div>
      )}

      {view === "accounts" && (
        <div className="max-w-3xl">
          <AccountsPanel
            boot={boot}
            onBootChange={refreshBoot}
            gotoDatabase={() => setView("database")}
          />
        </div>
      )}

      {view === "agent" && (
        <div className="max-w-3xl">
          <AgentAccessPanel cfg={cfg} onLoaded={setForm} />
        </div>
      )}

      {view === "database" && (
        <div className="max-w-3xl">
          <DatabasePanel
            onConfigured={refreshBoot}
            gotoAccounts={() => setView("accounts")}
          />
        </div>
      )}
    </>
  );
}
