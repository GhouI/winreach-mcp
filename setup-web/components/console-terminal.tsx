"use client";

// Embedded host console. Sends one command at a time to /api/shell (admin-
// gated) and renders the scrollback: prompt echo, stdout, stderr, exit status.
// No PTY — each command is an independent request/response. Command history is
// navigable with the up/down arrows. Runs on THIS host as the app's user.

import { useCallback, useEffect, useRef, useState } from "react";

type ShellResponse = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  truncated: boolean;
  shell: string;
  error?: string;
  code?: string;
};

type Line =
  | { kind: "input"; text: string }
  | { kind: "out"; text: string }
  | { kind: "err"; text: string }
  | { kind: "note"; text: string };

const PROMPT = "›";

export function ConsoleTerminal({ className }: { className?: string }) {
  const [lines, setLines] = useState<Line[]>([
    { kind: "note", text: "Connected to the host shell. Commands run on this machine as the app's user." },
  ]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, busy]);

  const append = useCallback((next: Line[]) => setLines((prev) => [...prev, ...next]), []);

  const run = useCallback(async () => {
    const cmd = command.trim();
    if (!cmd || busy) return;
    setCommand("");
    setHistory((h) => (h[h.length - 1] === cmd ? h : [...h, cmd]));
    setHistIdx(-1);
    append([{ kind: "input", text: cmd }]);
    setBusy(true);
    try {
      const res = await fetch("/api/shell", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = (await res.json().catch(() => null)) as ShellResponse | null;
      if (!res.ok || !data) {
        const msg =
          data?.error ??
          (res.status === 401
            ? "Not signed in. Sign in as an admin (Accounts) to use the console."
            : res.status === 503
              ? "No database configured — admin sessions are unavailable."
              : `Request failed (${res.status}).`);
        append([{ kind: "err", text: msg }]);
        return;
      }
      const out: Line[] = [];
      if (data.stdout) out.push({ kind: "out", text: data.stdout.replace(/\n$/, "") });
      if (data.stderr) out.push({ kind: "err", text: data.stderr.replace(/\n$/, "") });
      if (data.timedOut) out.push({ kind: "note", text: "[command timed out and was terminated]" });
      if (data.truncated) out.push({ kind: "note", text: "[output truncated]" });
      if (!data.stdout && !data.stderr && !data.timedOut) {
        out.push({ kind: "note", text: `[exit ${data.exitCode}]` });
      } else if (data.exitCode !== 0) {
        out.push({ kind: "note", text: `[exit ${data.exitCode}]` });
      }
      append(out);
    } catch {
      append([{ kind: "err", text: "Could not reach the console API on this host." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [command, busy, append]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void run();
      return;
    }
    if (e.key === "ArrowUp") {
      if (history.length === 0) return;
      e.preventDefault();
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setCommand(history[idx]);
      return;
    }
    if (e.key === "ArrowDown") {
      if (histIdx === -1) return;
      e.preventDefault();
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setCommand("");
      } else {
        setHistIdx(idx);
        setCommand(history[idx]);
      }
    }
  };

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-code-border bg-code ${className ?? ""}`}>
      {/* ---- Title strip ---- */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-code-border px-4 py-2.5">
        <span className="font-mono text-[11px] text-code-muted">host console — runs on this host as the app&apos;s user</span>
        <button
          type="button"
          onClick={() => setLines([{ kind: "note", text: "Cleared." }])}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-code-muted transition-colors hover:bg-white/10 hover:text-code-fg"
        >
          Clear
        </button>
      </div>

      {/* ---- Scrollback ---- */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="code-scroll min-h-[240px] flex-1 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-6"
      >
        {lines.map((line, i) => (
          <pre
            key={i}
            className={`whitespace-pre-wrap break-all ${
              line.kind === "input"
                ? "text-code-fg"
                : line.kind === "err"
                  ? "text-[var(--danger)]"
                  : line.kind === "note"
                    ? "text-code-muted"
                    : "text-code-fg/90"
            }`}
          >
            {line.kind === "input" ? (
              <>
                <span className="text-code-accent">{PROMPT} </span>
                {line.text}
              </>
            ) : (
              line.text
            )}
          </pre>
        ))}
        {busy && <pre className="text-code-muted">running…</pre>}
      </div>

      {/* ---- Prompt ---- */}
      <div className="flex shrink-0 items-center gap-2 border-t border-code-border px-4 py-2.5">
        <span aria-hidden className="font-mono text-[13px] text-code-accent">
          {PROMPT}
        </span>
        <input
          ref={inputRef}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={busy}
          placeholder={busy ? "" : "type a command, press Enter"}
          aria-label="Console command"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-code-fg placeholder:text-code-muted focus:outline-none disabled:opacity-60"
        />
      </div>
    </div>
  );
}
