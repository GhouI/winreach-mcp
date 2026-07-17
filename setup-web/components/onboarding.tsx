"use client";

// Wizard onboarding. A numbered step indicator runs across the TOP; below it
// sits only the current step's fields ("the model"). Back / Next move between
// steps. The final step reviews the configuration, collects the setup key, and
// on Finish APPLIES the config to this host (POST /api/apply) — writing the
// WINREACH_* environment + a start script and persisting the config — then
// hands off to the dashboard.

import { useState } from "react";
import type { WinReachConfig } from "@/lib/winreach-config";
import { connectUrl } from "@/lib/winreach-config";
import type { FormState } from "@/lib/form-state";
import { btnPrimary, btnSecondary, Field, StatusMsg, TextInput, Warn } from "@/components/ui";
import { Stepper } from "@/components/stepper";
import {
  AccessSection,
  PolicySection,
  SecuritySection,
  ServerSection,
  ToolsSection,
  type SetField,
} from "@/components/config-sections";

type StepId = "server" | "security" | "tools" | "policy" | "access" | "finish";

const STEPS: { id: StepId; title: string; heading: string; blurb: string }[] = [
  {
    id: "server",
    title: "Server",
    heading: "Name & bind the server",
    blurb: "Where WinReach listens and which networks may reach it.",
  },
  {
    id: "security",
    title: "Security",
    heading: "Secure the transport",
    blurb: "Optional HTTPS / mTLS. Skip to stay on plain HTTP behind a tunnel.",
  },
  {
    id: "tools",
    title: "Tools",
    heading: "Choose tools",
    blurb: "powershell_* is always on. Turn on screenshots or file transfer if needed.",
  },
  {
    id: "policy",
    title: "Policy",
    heading: "Lock down commands",
    blurb: "Optional allow/deny regex for PowerShell. Deny always wins.",
  },
  {
    id: "access",
    title: "Access",
    heading: "Set up access",
    blurb: "A single admin token, or per-user keys with their own limits.",
  },
  {
    id: "finish",
    title: "Finish",
    heading: "Review & apply",
    blurb: "Apply this configuration to the host, then open the console.",
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
  cfg: WinReachConfig;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const total = STEPS.length;
  const meta = STEPS[step];
  const isFinish = meta.id === "finish";

  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(total - 1, s + 1));

  return (
    <div className="mx-auto max-w-2xl">
      {/* ---- Top numbered step indicator ---- */}
      <div className="mb-9">
        <Stepper steps={STEPS.map((s) => s.title)} current={step} onSelect={setStep} />
      </div>

      {/* ---- Current step ("the model") ---- */}
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <div className="mb-6">
          <p className="eyebrow mb-2">
            Step {step + 1} of {total}
          </p>
          <h2 className="text-[20px] font-semibold leading-tight tracking-tight">{meta.heading}</h2>
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-muted">{meta.blurb}</p>
        </div>

        {meta.id === "server" && <ServerSection form={form} set={set} frameless />}
        {meta.id === "security" && <SecuritySection form={form} set={set} frameless />}
        {meta.id === "tools" && <ToolsSection form={form} set={set} frameless />}
        {meta.id === "policy" && <PolicySection form={form} set={set} frameless />}
        {meta.id === "access" && <AccessSection form={form} set={set} frameless />}
        {isFinish && <FinishStep cfg={cfg} form={form} onFinish={onFinish} />}
      </div>

      {/* ---- Back / Next ---- */}
      <div className="mt-6 flex items-center justify-between">
        <button type="button" onClick={back} disabled={step === 0} className={btnSecondary}>
          Back
        </button>
        {!isFinish ? (
          <button type="button" onClick={next} className={btnPrimary}>
            Next
          </button>
        ) : (
          <span className="text-xs text-faint">Apply below to finish</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- Finish --------------------------------- */

type ApplyResult = {
  dataDir: string;
  wrote: { envFile: string; startScript: string; config: string };
  envVarCount: number;
};

function FinishStep({
  cfg,
  form,
  onFinish,
}: {
  cfg: WinReachConfig;
  form: FormState;
  onFinish: () => void;
}) {
  const [setupKey, setSetupKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  const transport =
    cfg.tls.certPath && cfg.tls.keyPath
      ? cfg.tls.clientCaPath
        ? "HTTPS + mTLS"
        : "HTTPS"
      : "HTTP";
  const access =
    cfg.authMode === "users"
      ? `${cfg.users.length} user${cfg.users.length === 1 ? "" : "s"}`
      : form.token.trim()
        ? "single token"
        : "token not set";

  const apply = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: {
          authorization: `Bearer ${setupKey.trim()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ config: cfg }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        setMsg({ tone: "err", text: data?.error ?? `Request failed (${res.status}).` });
        return;
      }
      setResult(data as ApplyResult);
      setMsg({ tone: "ok", text: "Applied to this host. Opening the console…" });
      setTimeout(() => onFinish(), 900);
    } catch {
      setMsg({ tone: "err", text: "Could not reach the setup API on this host." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Summary label="Connect URL" value={connectUrl(cfg)} mono wide />
        <Summary label="Transport" value={transport} />
        <Summary label="Access" value={access} />
      </dl>

      <div className="border-t border-border pt-6">
        <Warn>
          Finishing writes to <strong>this host</strong>. It saves the WINREACH_* environment to{" "}
          <code className="font-mono">winreach.env</code>, writes{" "}
          <code className="font-mono">start-winreach.ps1</code>, and persists the configuration in
          the app&apos;s data directory.
        </Warn>
      </div>

      <div>
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          Applying requires the <code className="font-mono">WINREACH_SETUP_KEY</code> set on this
          host (the same key the Database and Agent access panels use).
        </p>
        <div className="mt-3">
          <Field label="Setup key" hint="Must match WINREACH_SETUP_KEY on this host.">
            <TextInput
              value={setupKey}
              onChange={setSetupKey}
              placeholder="paste your setup key"
              type="password"
              mono
            />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={apply}
        disabled={busy || !setupKey.trim()}
        className={`${btnPrimary} w-full`}
      >
        {busy ? "Applying…" : "Finish & apply to this host"}
      </button>

      {msg && <StatusMsg tone={msg.tone}>{msg.text}</StatusMsg>}

      {result && (
        <div className="rounded-md border border-border bg-background/60 p-4">
          <p className="text-[13px] font-medium">Wrote to the host</p>
          <ul className="mt-2 space-y-1 font-mono text-[11.5px] leading-relaxed text-muted">
            <li className="break-all">{result.wrote.envFile}</li>
            <li className="break-all">{result.wrote.startScript}</li>
            <li className="break-all">{result.wrote.config}</li>
          </ul>
          <p className="mt-2 text-xs text-muted">
            {result.envVarCount} environment variable{result.envVarCount === 1 ? "" : "s"} applied.
          </p>
        </div>
      )}
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
