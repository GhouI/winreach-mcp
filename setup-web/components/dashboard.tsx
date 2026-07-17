"use client";

// The console (post-onboarding). A left sidebar drives a single content pane —
// no giant stacked page. Sidebar groups:
//
//   Configuration  (expandable) -> Server · Security · Tools · Policy · Access
//   Output         -> generated env / firewall / agent snippets (OutputPanel)
//   Accounts       -> database-backed account keys
//   Agent access   -> save/load the config on the host
//   Database       -> pick + set up the account store
//   Console        -> embedded host terminal (/api/shell)
//
// Only the selected panel renders in the content area. Empty/gated states are
// prompts, not blank space.

import { useState } from "react";
import { connectUrl, type WinBridgeConfig } from "@/lib/winbridge-config";
import type { FormState } from "@/lib/form-state";
import { OutputPanel } from "@/components/output-panel";
import { ConsoleTerminal } from "@/components/console-terminal";
import {
  AccessSection,
  PolicySection,
  SecuritySection,
  ServerSection,
  ToolsSection,
  type SetField,
} from "@/components/config-sections";
import { AccountsPanel, type Boot } from "@/components/accounts-panel";
import { AgentAccessPanel } from "@/components/agent-access-panel";
import { DatabasePanel } from "@/components/database-panel";
import { ChevronIcon } from "@/components/icons";

type View =
  | "cfg:server"
  | "cfg:security"
  | "cfg:tools"
  | "cfg:policy"
  | "cfg:access"
  | "output"
  | "accounts"
  | "agent"
  | "database"
  | "console";

const CONFIG_ITEMS: { id: View; label: string }[] = [
  { id: "cfg:server", label: "Server" },
  { id: "cfg:security", label: "Security" },
  { id: "cfg:tools", label: "Tools" },
  { id: "cfg:policy", label: "Policy" },
  { id: "cfg:access", label: "Access" },
];

const VIEW_TITLES: Record<View, string> = {
  "cfg:server": "Server",
  "cfg:security": "Security",
  "cfg:tools": "Tools",
  "cfg:policy": "Policy",
  "cfg:access": "Access",
  output: "Output",
  accounts: "Accounts",
  agent: "Agent access",
  database: "Database",
  console: "Console",
};

export function Dashboard({
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
  const [view, setView] = useState<View>("cfg:server");
  const [cfgOpen, setCfgOpen] = useState(true);

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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* ============================ Sidebar ============================ */}
      <aside className="lg:sticky lg:top-[4.5rem] lg:h-fit">
        <nav aria-label="Console" className="space-y-1">
          {/* Configuration group */}
          <SidebarGroupButton
            label="Configuration"
            open={cfgOpen}
            onClick={() => setCfgOpen((o) => !o)}
          />
          {cfgOpen && (
            <div className="mb-1 space-y-0.5 border-l border-border pl-2">
              {CONFIG_ITEMS.map((it) => (
                <SidebarItem
                  key={it.id}
                  label={it.label}
                  active={view === it.id}
                  onClick={() => setView(it.id)}
                  nested
                />
              ))}
            </div>
          )}

          <SidebarItem label="Output" active={view === "output"} onClick={() => setView("output")} />
          <SidebarItem label="Accounts" active={view === "accounts"} onClick={() => setView("accounts")} />
          <SidebarItem label="Agent access" active={view === "agent"} onClick={() => setView("agent")} />
          <SidebarItem label="Database" active={view === "database"} onClick={() => setView("database")} />
          <SidebarItem label="Console" active={view === "console"} onClick={() => setView("console")} />
        </nav>

        <div className="mt-6 border-t border-border pt-4">
          <button
            type="button"
            onClick={onRestart}
            className="text-xs font-medium text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Run setup again
          </button>
        </div>
      </aside>

      {/* ============================ Content ============================ */}
      <div className="min-w-0">
        {/* Masthead */}
        <div className="mb-7 border-b border-border pb-5">
          <p className="eyebrow mb-2">{VIEW_TITLES[view]}</p>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">WinBridge server</h1>
          <p className="mt-2 break-all font-mono text-[12px] leading-relaxed text-muted">
            {connectUrl(cfg)}
            <span className="mx-2 text-faint" aria-hidden>·</span>
            {transport}
            <span className="mx-2 text-faint" aria-hidden>·</span>
            {access}
          </p>
        </div>

        {/* Panels */}
        {view === "cfg:server" && (
          <Panel>
            <ServerSection form={form} set={set} />
          </Panel>
        )}
        {view === "cfg:security" && (
          <Panel>
            <SecuritySection form={form} set={set} />
          </Panel>
        )}
        {view === "cfg:tools" && (
          <Panel>
            <ToolsSection form={form} set={set} />
          </Panel>
        )}
        {view === "cfg:policy" && (
          <Panel>
            <PolicySection form={form} set={set} />
          </Panel>
        )}
        {view === "cfg:access" && (
          <Panel>
            <AccessSection form={form} set={set} />
          </Panel>
        )}

        {view === "output" && (
          <Panel wide>
            <OutputPanel tabs={tabs} connect={connectUrl(cfg)} features={features} />
          </Panel>
        )}

        {view === "accounts" && (
          <Panel>
            <AccountsPanel boot={boot} onBootChange={refreshBoot} gotoDatabase={() => setView("database")} />
          </Panel>
        )}

        {view === "agent" && (
          <Panel>
            <AgentAccessPanel cfg={cfg} onLoaded={setForm} />
          </Panel>
        )}

        {view === "database" && (
          <Panel>
            <DatabasePanel onConfigured={refreshBoot} gotoAccounts={() => setView("accounts")} />
          </Panel>
        )}

        {view === "console" && (
          <Panel wide>
            <div className="space-y-4">
              <p className="max-w-prose text-[13px] leading-relaxed text-muted">
                Run commands on this host&apos;s default shell
                {" "}(<span className="font-mono">PowerShell</span> on Windows). Commands execute as
                the account running this app and require an admin session — sign in under Accounts if
                the console reports you are not authenticated.
              </p>
              <ConsoleTerminal />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Sidebar UI ------------------------------- */

function SidebarGroupButton({
  label,
  open,
  onClick,
}: {
  label: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-surface-muted"
    >
      {label}
      <ChevronIcon className={`size-3.5 text-faint transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

function SidebarItem({
  label,
  active,
  onClick,
  nested,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  nested?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex w-full items-center rounded-md py-1.5 text-left text-[13px] transition-colors ${
        nested ? "pl-3 pr-2.5" : "px-2.5"
      } ${
        active
          ? "bg-surface-muted font-medium text-foreground"
          : "text-muted hover:bg-surface-muted/60 hover:text-foreground"
      }`}
    >
      {active && (
        <span aria-hidden className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      {label}
    </button>
  );
}

function Panel({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={wide ? "min-w-0" : "max-w-3xl"}>{children}</div>;
}
