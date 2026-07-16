"use client";

// The live output viewer: connect URL, enabled-feature summary, tabbed
// generated snippets in an always-dark code surface with copy feedback.

import { useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";

/** Context line shown in the code viewer's filename strip, per tab. */
const TAB_META: Record<string, string> = {
  "Env (PowerShell)": "paste into a PowerShell session",
  "start.ps1": "start.ps1",
  Firewall: "PowerShell — run as Administrator",
  "Claude Code": "terminal command",
  Codex: "~/.codex/config.toml",
};

export function OutputPanel({
  tabs,
  connect,
  features,
}: {
  tabs: Record<string, string>;
  connect: string;
  features: string[];
}) {
  const names = Object.keys(tabs);
  const [active, setActive] = useState(names[0]);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = tabs[active] ?? "";

  const copy = async (text: string, which: "code" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1400);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      {/* ---- Header: connect URL + summary ---- */}
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Live output
          </p>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            updates as you type
          </span>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted">Connect URL</p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12.5px]">
              {connect}
            </code>
            <button
              type="button"
              onClick={() => copy(connect, "url")}
              aria-label="Copy connect URL"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {copied === "url" ? (
                <CheckIcon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
            </button>
          </div>
        </div>

        {features.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Enabled features">
            {features.map((f, i) => (
              <span
                key={f}
                className={
                  i === 0
                    ? "inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11px] text-muted"
                    : "inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 font-mono text-[11px] text-accent"
                }
              >
                {f}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ---- Tabs ---- */}
      <div
        role="tablist"
        aria-label="Generated output"
        className="flex gap-0.5 overflow-x-auto border-b border-border bg-surface-muted/60 px-2 code-scroll"
      >
        {names.map((n) => {
          const isActive = active === n;
          return (
            <button
              key={n}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls="output-tabpanel"
              onClick={() => setActive(n)}
              className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 ${
                isActive ? "text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {n}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ---- Code viewer (always dark) ---- */}
      <div id="output-tabpanel" role="tabpanel" aria-label={active} className="bg-code">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
          <span className="truncate font-mono text-[11px] text-code-muted">
            {TAB_META[active] ?? active}
          </span>
          <button
            type="button"
            onClick={() => copy(current, "code")}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              copied === "code"
                ? "text-emerald-400"
                : "text-code-muted hover:bg-white/10 hover:text-white"
            }`}
          >
            {copied === "code" ? (
              <>
                <CheckIcon className="size-3.5" /> Copied
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" /> Copy
              </>
            )}
            <span aria-live="polite" className="sr-only">
              {copied === "code" ? "Copied to clipboard" : ""}
            </span>
          </button>
        </div>
        <pre className="code-scroll max-h-[55vh] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-6 text-code-fg">
          {current || "# Fill in the form to generate output"}
        </pre>
      </div>
    </div>
  );
}
