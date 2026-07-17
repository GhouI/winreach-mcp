"use client";

import { useState } from "react";
import { btnSecondary } from "@/components/ui";
import { CheckIcon, CopyIcon } from "@/components/icons";

/** One-time display of a freshly minted agent key, with copy-to-clipboard. */
export function TokenBanner({ name, token, onDismiss }: { name: string; token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="rounded-md border-l-2 border border-border border-l-accent bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Key for “{name}” — shown once</p>
          <p className="mt-0.5 text-xs text-muted">
            Copy it now. Only its hash is stored; you cannot see it again.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-medium text-muted hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[12.5px]">
          {token}
        </code>
        <button type="button" onClick={copy} className={`${btnSecondary} h-8 shrink-0 px-3 text-xs`}>
          {copied ? <CheckIcon className="size-3.5 text-ok" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Read-only, copyable code block used for the WINREACH_PRINCIPALS export. */
export function CodeBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="overflow-hidden rounded-md border border-code-border bg-code">
      <div className="flex items-center justify-between border-b border-code-border px-4 py-2">
        <span className="font-mono text-[11px] text-code-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-code-muted transition-colors hover:bg-white/10 hover:text-code-fg"
        >
          {copied ? <CheckIcon className="size-3.5 text-code-ok" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-scroll max-h-[50vh] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-xs leading-6 text-code-fg">
        {text || "[]"}
      </pre>
    </div>
  );
}
