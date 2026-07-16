"use client";

// Horizontal stage indicator for the setup wizard. Steps are freely
// navigable; visited steps show a check, steps with active warnings get an
// amber dot so problems stay visible from any stage.

import { CheckIcon } from "@/components/icons";

export function Stepper({
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
      <ol className="flex items-center gap-1 overflow-x-auto pb-1 code-scroll">
        {steps.map((title, i) => {
          const isActive = i === active;
          const isDone = i < active;
          const hasFlag = flagged.includes(i);
          return (
            <li key={title} className="flex shrink-0 items-center gap-1">
              {i > 0 && <span aria-hidden className="h-px w-3 bg-border sm:w-4" />}
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "step" : undefined}
                className={`group flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  isActive ? "bg-accent/10" : "hover:bg-surface-muted"
                }`}
              >
                <span className="relative">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${
                      isActive
                        ? "bg-accent text-accent-fg"
                        : isDone
                          ? "bg-accent/15 text-accent"
                          : "border border-border-strong bg-surface text-muted"
                    }`}
                  >
                    {isDone ? <CheckIcon className="size-3" /> : i + 1}
                  </span>
                  {hasFlag && (
                    <span
                      aria-hidden
                      className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-500 ring-2 ring-background"
                    />
                  )}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isActive ? "text-foreground" : "hidden text-muted group-hover:text-foreground sm:block"
                  }`}
                >
                  {title}
                  {hasFlag && <span className="sr-only"> (has warnings)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
