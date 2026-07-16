"use client";

// Shared chrome for the admin area (/login, /admin/setup, /admin). Mirrors the
// top bar + centered layout of the setup wizard so the pages read as one app.

import Link from "next/link";
import { LockIcon, TerminalIcon } from "@/components/icons";

export function AdminShell({
  crumb,
  right,
  children,
}: {
  crumb: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-full flex-col">
      <div aria-hidden className="top-glow pointer-events-none absolute inset-x-0 top-0 h-80" />

      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg shadow-sm">
              <TerminalIcon className="size-4" />
            </Link>
            <span className="truncate text-sm font-semibold tracking-tight">WinBridge MCP</span>
            <span aria-hidden className="text-faint">/</span>
            <span className="text-sm text-muted">{crumb}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
            {right ?? (
              <span className="hidden items-center gap-1.5 sm:flex">
                <LockIcon className="size-3.5" />
                Admin
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-4xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:pt-14">
        {children}
      </main>
    </div>
  );
}

/* Shared button styles matching the wizard. */
export const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondary =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50";

export function StatusMsg({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`text-xs leading-relaxed ${
        tone === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      {children}
    </p>
  );
}
