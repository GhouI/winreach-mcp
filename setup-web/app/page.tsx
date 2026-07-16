"use client";

// The whole app lives at "/".
//
//   First run   -> checklist onboarding: a short, resumable list of steps that
//                  each expand inline to reveal only their fields.
//   Configured  -> the console (dashboard): a left sidebar drives one panel at
//                  a time — Configuration, Output, Accounts, Agent access,
//                  Database, Console.
//
// Completion + the working configuration persist in localStorage; the config
// itself round-trips through sanitizeConfig so stored JSON can never break the
// editor. All server contracts (/api/*) are unchanged.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildClaudeConfig,
  buildCodexConfig,
  buildFirewallRule,
  buildPowerShellEnv,
  buildPrincipalsJson,
  buildStartScript,
} from "@/lib/winbridge-config";
import {
  INITIAL,
  fromConfig,
  sanitizeConfig,
  toConfig,
  type FormState,
} from "@/lib/form-state";
import type { SetField } from "@/components/config-sections";
import { Onboarding } from "@/components/onboarding";
import { Dashboard } from "@/components/dashboard";
import { ConsoleButton, ConsoleModal } from "@/components/console-modal";
import type { Boot } from "@/components/accounts-panel";

const CONFIG_KEY = "winbridge.setup.v1";
const ONBOARD_KEY = "winbridge.onboarded.v1";

type Phase = "loading" | "onboarding" | "dashboard";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<FormState>(INITIAL);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);

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
          <div className="flex items-center gap-3">
            <span className="eyebrow hidden sm:inline">
              {phase === "dashboard" ? "Console" : phase === "onboarding" ? "Setup" : ""}
            </span>
            {phase === "dashboard" && <ConsoleButton onOpen={() => setConsoleOpen(true)} />}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 pt-10 sm:px-6 lg:pt-12">
        {phase === "onboarding" && (
          <Onboarding form={form} set={set} cfg={cfg} onFinish={finishSetup} />
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

      {/* ---- Header console overlay ---- */}
      <ConsoleModal open={consoleOpen} onClose={() => setConsoleOpen(false)} />
    </div>
  );
}
