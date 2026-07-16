"use client";

// Presentational form primitives for the setup wizard. Purely visual — all
// state lives in app/page.tsx and flows in through props.

import { AlertIcon } from "@/components/icons";

/* ------------------------------- Section -------------------------------- */

export function Section({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted">{desc}</p>}
        </div>
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>;
}

/* -------------------------------- Field --------------------------------- */

export function Field({
  label,
  hint,
  children,
  asDiv,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  /** Render a div instead of a label — for children that are buttons (toggles). */
  asDiv?: boolean;
}) {
  const Tag = asDiv ? "div" : "label";
  return (
    <Tag className="block min-w-0">
      <span className="block text-[13px] font-medium leading-none">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </Tag>
  );
}

/* -------------------------------- Inputs --------------------------------- */

const inputClass =
  "w-full rounded-lg border border-border bg-background text-sm text-foreground shadow-xs " +
  "placeholder:text-faint transition-[border-color,box-shadow] outline-none " +
  "hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20";

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <input
      type="text"
      value={value}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      spellCheck={false}
      className={`${inputClass} h-9 px-3 ${mono ? "font-mono text-[13px]" : ""}`}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      className={`${inputClass} resize-y px-3 py-2 font-mono text-[13px] leading-relaxed`}
    />
  );
}

/* -------------------------------- Toggle --------------------------------- */

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex items-start gap-3 text-left outline-none"
    >
      <span
        className={`relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 group-focus-visible:ring-2 group-focus-visible:ring-accent/40 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface ${
          checked ? "bg-accent" : "bg-border-strong group-hover:bg-faint/70"
        }`}
      >
        <span
          className={`inline-block size-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[13px] font-medium leading-5">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------- Warning --------------------------------- */

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
    >
      <AlertIcon className="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <p>{children}</p>
    </div>
  );
}
