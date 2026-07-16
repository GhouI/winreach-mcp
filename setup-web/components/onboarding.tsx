"use client";

// Checklist-driven onboarding. Instead of a dense six-stage wizard, the user
// sees a short list of concrete steps. Each item expands INLINE to reveal only
// its own fields; completed items get a check and the list tracks progress.
// Users can leave and come back — completion is derived from the live config,
// so returning re-lights the right checks automatically.

import { useMemo, useState } from "react";
import type { WinBridgeConfig } from "@/lib/winbridge-config";
import { connectUrl } from "@/lib/winbridge-config";
import type { FormState } from "@/lib/form-state";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { CheckIcon, ChevronIcon } from "@/components/icons";
import {
  AccessSection,
  PolicySection,
  SecuritySection,
  ServerSection,
  ToolsSection,
  formWarnings,
  type SetField,
} from "@/components/config-sections";

type StepId = "server" | "security" | "tools" | "policy" | "access" | "finish";

type Step = {
  id: StepId;
  title: string;
  blurb: string;
  /** Whether this step counts as "done" given the current config. */
  done: (f: FormState, cfg: WinBridgeConfig) => boolean;
  /** Non-blocking warning marker. */
  warn?: (f: FormState) => boolean;
};

const STEPS: Step[] = [
  {
    id: "server",
    title: "Name & bind the server",
    blurb: "Where WinBridge listens and which networks may reach it.",
    done: (f) => f.host.trim().length > 0 && f.port.trim().length > 0 && f.endpointPath.trim().length > 0,
    warn: (f) => formWarnings(f).exposedNoIps,
  },
  {
    id: "security",
    title: "Secure the transport",
    blurb: "Optional HTTPS / mTLS. Skip to stay on plain HTTP behind a tunnel.",
    done: (f) => !formWarnings(f).tlsIncomplete,
    warn: (f) => formWarnings(f).tlsIncomplete,
  },
  {
    id: "tools",
    title: "Choose tools",
    blurb: "powershell_* is always on. Turn on screenshots or file transfer if needed.",
    done: (f) => !formWarnings(f).fileEnabledNoRoot,
    warn: (f) => formWarnings(f).fileEnabledNoRoot,
  },
  {
    id: "policy",
    title: "Lock down commands",
    blurb: "Optional allow/deny regex for PowerShell. Deny always wins.",
    done: () => true, // optional — always satisfiable
  },
  {
    id: "access",
    title: "Set up access",
    blurb: "A single admin token, or per-user keys with their own limits.",
    done: (f) => (f.authMode === "single" ? f.token.trim().length > 0 : f.users.length > 0),
    warn: (f) => formWarnings(f).usersNoneYet || formWarnings(f).tokenMissing,
  },
];

export function Onboarding({
  form,
  set,
  cfg,
  onFinish,
}: {
  form: FormState;
  set: SetField;
  cfg: WinBridgeConfig;
  onFinish: () => void;
}) {
  const [open, setOpen] = useState<StepId | null>("server");

  const status = useMemo(
    () =>
      STEPS.map((s) => ({
        id: s.id,
        done: s.done(form, cfg),
        warn: s.warn?.(form) ?? false,
      })),
    [form, cfg],
  );
  const doneCount = status.filter((s) => s.done).length;
  const total = STEPS.length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  const toggle = (id: StepId) => setOpen((cur) => (cur === id ? null : id));
  const advance = (id: StepId) => {
    const idx = STEPS.findIndex((s) => s.id === id);
    setOpen(idx >= 0 && idx < STEPS.length - 1 ? STEPS[idx + 1].id : null);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* ---- Hero ---- */}
      <div className="mb-8">
        <p className="eyebrow mb-3">Get started</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          Set up WinBridge in a few steps
        </h1>
        <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-muted">
          Work through the checklist below — each step opens just the fields it needs. You can
          leave and pick up where you left off. Takes about 3–5 minutes.
        </p>
      </div>

      {/* ---- Progress ---- */}
      <div className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[13px] font-medium">Setup progress</span>
          <span className="font-mono text-[12px] tabular-nums text-muted">
            {doneCount} / {total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* ---- Checklist ---- */}
      <ol className="space-y-2.5">
        {STEPS.map((step, i) => {
          const st = status[i];
          const isOpen = open === step.id;
          return (
            <li
              key={step.id}
              className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
                isOpen ? "border-border-strong" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(step.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-surface-muted/50"
              >
                <StepBadge index={i + 1} done={st.done} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-medium tracking-tight">{step.title}</span>
                    {st.warn && (
                      <>
                        <span aria-hidden className="size-1.5 rounded-full bg-warn" />
                        <span className="sr-only">has warnings</span>
                      </>
                    )}
                  </span>
                  {!isOpen && (
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted">{step.blurb}</span>
                  )}
                </span>
                <ChevronIcon
                  className={`size-4 shrink-0 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-5 sm:px-5">
                  <StepBody id={step.id} form={form} set={set} />
                  <div className="mt-6 flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setOpen(null)} className={btnSecondary}>
                      Collapse
                    </button>
                    {i < STEPS.length - 1 && (
                      <button type="button" onClick={() => advance(step.id)} className={btnPrimary}>
                        Next step
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}

        {/* ---- Finish ---- */}
        <li
          className={`overflow-hidden rounded-lg border bg-surface transition-colors ${
            open === "finish" ? "border-border-strong" : "border-border"
          }`}
        >
          <button
            type="button"
            onClick={() => toggle("finish")}
            aria-expanded={open === "finish"}
            className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-surface-muted/50"
          >
            <StepBadge index={total + 1} done={allDone} />
            <span className="min-w-0 flex-1">
              <span className="text-[14px] font-medium tracking-tight">Finish & open the console</span>
              {open !== "finish" && (
                <span className="mt-0.5 block truncate text-[12.5px] text-muted">
                  Review the summary and go to your dashboard.
                </span>
              )}
            </span>
            <ChevronIcon
              className={`size-4 shrink-0 text-faint transition-transform ${open === "finish" ? "rotate-90" : ""}`}
            />
          </button>
          {open === "finish" && (
            <div className="border-t border-border px-4 py-5 sm:px-5">
              <FinishBody form={form} cfg={cfg} status={status} onFinish={onFinish} onOpen={setOpen} />
            </div>
          )}
        </li>
      </ol>
    </div>
  );
}

function StepBadge({ index, done }: { index: number; done: boolean }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-colors ${
        done
          ? "bg-accent text-accent-fg"
          : "border border-border-strong text-muted"
      }`}
    >
      {done ? <CheckIcon className="size-3.5" /> : index}
    </span>
  );
}

function StepBody({ id, form, set }: { id: StepId; form: FormState; set: SetField }) {
  switch (id) {
    case "server":
      return <ServerSection form={form} set={set} frameless />;
    case "security":
      return <SecuritySection form={form} set={set} frameless />;
    case "tools":
      return <ToolsSection form={form} set={set} frameless />;
    case "policy":
      return <PolicySection form={form} set={set} frameless />;
    case "access":
      return <AccessSection form={form} set={set} frameless />;
    default:
      return null;
  }
}

function FinishBody({
  form,
  cfg,
  status,
  onFinish,
  onOpen,
}: {
  form: FormState;
  cfg: WinBridgeConfig;
  status: { id: StepId; done: boolean; warn: boolean }[];
  onFinish: () => void;
  onOpen: (id: StepId) => void;
}) {
  const pending = status.filter((s) => !s.done);
  const access =
    cfg.authMode === "users"
      ? `${cfg.users.length} user${cfg.users.length === 1 ? "" : "s"}`
      : form.token.trim()
        ? "single token"
        : "token not set";
  const transport =
    cfg.tls.certPath && cfg.tls.keyPath
      ? cfg.tls.clientCaPath
        ? "HTTPS + mTLS"
        : "HTTPS"
      : "HTTP";

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <Summary label="Connect URL" value={connectUrl(cfg)} mono wide />
        <Summary label="Transport" value={transport} />
        <Summary label="Access" value={access} />
      </dl>

      {pending.length > 0 ? (
        <div className="rounded-md border border-border bg-background/60 p-4">
          <p className="text-[13px] font-medium">A few steps are still incomplete</p>
          <ul className="mt-2 space-y-1.5">
            {pending.map((p) => {
              const step = STEPS.find((s) => s.id === p.id);
              if (!step) return null;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(p.id)}
                    className="text-[13px] text-accent-text underline-offset-2 hover:underline"
                  >
                    {step.title} →
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            You can finish anyway and complete these later from the console.
          </p>
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-muted">
          Everything looks good. Open the console to copy your generated config, connect an agent,
          and manage accounts.
        </p>
      )}

      <button type="button" onClick={onFinish} className={`${btnPrimary} w-full`}>
        Finish & open the console
      </button>
    </div>
  );
}

function Summary({
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
