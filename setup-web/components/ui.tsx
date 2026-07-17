"use client";

// Presentational primitives shared across the console. Purely visual — all
// state lives in the pages/panels and flows in through props.

/* ------------------------------- Buttons --------------------------------- */

export const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium " +
  "text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45";

export const btnSecondary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 " +
  "text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-45";

export const btnDanger =
  "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-danger/40 px-4 text-sm " +
  "font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-45";

/* ------------------------------- Section --------------------------------- */

export function Section({
  eyebrow,
  title,
  desc,
  children,
  frameless,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
  /**
   * Render without the card chrome (border/header). Used when the section is
   * embedded in a container that already carries its title — e.g. an expanded
   * onboarding checklist item.
   */
  frameless?: boolean;
}) {
  if (frameless) {
    return (
      <section aria-label={title}>
        {desc && <p className="mb-5 max-w-prose text-[13px] leading-relaxed text-muted">{desc}</p>}
        <div className="space-y-6">{children}</div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-surface">
      <header className="border-b border-border px-6 py-5">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {desc && <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-muted">{desc}</p>}
      </header>
      <div className="space-y-6 px-6 py-6">{children}</div>
    </section>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2">{children}</div>;
}

/* -------------------------------- Field ---------------------------------- */

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

/* -------------------------------- Inputs ---------------------------------- */

const inputClass =
  "w-full rounded-md border border-border bg-background text-sm text-foreground " +
  "placeholder:text-faint transition-colors hover:border-border-strong focus:border-border-strong";

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "numeric";
  type?: "text" | "password";
}) {
  return (
    <input
      type={type}
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

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} h-9 px-3`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------- Toggle ---------------------------------- */

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
      className="group flex items-start gap-3 rounded-sm text-left"
    >
      <span
        className={`relative mt-px inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-border-strong group-hover:bg-faint/60"
        }`}
      >
        <span
          className={`inline-block size-3.5 transform rounded-full transition-transform ${
            checked ? "translate-x-[18px] bg-accent-fg" : "translate-x-[3px] bg-background"
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

/* ----------------------------- Disclosure -------------------------------- */

export function Disclosure({
  summary,
  hint,
  defaultOpen,
  children,
}: {
  summary: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-md border border-border bg-background/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-medium select-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <svg
            aria-hidden
            viewBox="0 0 12 12"
            className="size-3 text-muted transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {summary}
        </span>
        {hint && <span className="text-xs font-normal text-faint">{hint}</span>}
      </summary>
      <div className="space-y-6 border-t border-border px-4 py-5">{children}</div>
    </details>
  );
}

/* ------------------------------- Warning ---------------------------------- */

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="border-l-2 border-warn bg-warn/5 py-2.5 pl-4 pr-3 text-[13px] leading-relaxed text-warn"
    >
      {children}
    </div>
  );
}

/* ------------------------------ Status line ------------------------------- */

export function StatusMsg({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`text-[13px] leading-relaxed ${tone === "ok" ? "text-ok" : "text-danger"}`}
    >
      {children}
    </p>
  );
}
