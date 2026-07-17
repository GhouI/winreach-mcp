"use client";

// Header "Console" button + the overlay it opens. The overlay hosts the same
// embedded terminal used by the dashboard's Console panel. Closes on Escape or
// backdrop click.

import { useEffect } from "react";
import { ConsoleTerminal } from "@/components/console-terminal";

export function ConsoleButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      Console
    </button>
  );
}

export function ConsoleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Host console"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-tight">Host console</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              Runs on this host as the app&apos;s user · admin session required
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <ConsoleTerminal className="h-full" />
        </div>
      </div>
    </div>
  );
}
