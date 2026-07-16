"use client";

// Typographic stage rail for onboarding. Each stage is a segment with a thin
// top rule and a two-digit mono numeral — no chips, no icons. Rules read as a
// progress track: completed segments are inked, the active one is amber.
// Stages remain freely navigable; stages with active warnings carry a small
// orange marker (plus screen-reader text).

export function StageRail({
  steps,
  active,
  onSelect,
  flagged,
}: {
  steps: string[];
  active: number;
  onSelect: (index: number) => void;
  flagged: number[];
}) {
  return (
    <nav aria-label="Setup stages">
      <ol className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-6">
        {steps.map((title, i) => {
          const isActive = i === active;
          const isDone = i < active;
          const hasFlag = flagged.includes(i);
          return (
            <li key={title} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "step" : undefined}
                className={`group w-full border-t-2 pt-2.5 text-left transition-colors ${
                  isActive
                    ? "border-accent"
                    : isDone
                      ? "border-foreground/60 hover:border-foreground"
                      : "border-border hover:border-border-strong"
                }`}
              >
                <span
                  className={`block font-mono text-[11px] tabular-nums tracking-[0.08em] ${
                    isActive ? "text-accent-text" : isDone ? "text-foreground" : "text-faint"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`mt-1 block truncate text-[13px] leading-snug ${
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted group-hover:text-foreground"
                  }`}
                >
                  {title}
                  {hasFlag && (
                    <>
                      <span
                        aria-hidden
                        className="ml-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-warn align-middle"
                      />
                      <span className="sr-only"> — has warnings</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
