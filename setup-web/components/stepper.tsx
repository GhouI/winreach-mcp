"use client";

// Numbered step indicator for onboarding. A horizontal row of numbered nodes
// joined by a progress track: completed nodes are inked amber (with a check),
// the current node is ringed amber, upcoming nodes are quiet. Steps stay freely
// navigable — click any node to jump. Labels show from `sm`; on narrow screens
// the content area carries a "Step X of N" heading instead.

import { Fragment } from "react";
import { CheckIcon } from "@/components/icons";

export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: string[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const last = steps.length - 1;
  return (
    <nav aria-label="Setup steps">
      <ol className="flex items-start">
        {steps.map((title, i) => {
          const state = i < current ? "done" : i === current ? "active" : "todo";
          return (
            <Fragment key={title}>
              <li className="flex min-w-0 shrink-0 flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={state === "active" ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${title}`}
                  className={`flex size-8 items-center justify-center rounded-full text-[12px] font-semibold tabular-nums transition-colors ${
                    state === "done"
                      ? "bg-accent text-accent-fg"
                      : state === "active"
                        ? "border-2 border-accent bg-background text-foreground"
                        : "border border-border-strong bg-surface text-faint hover:border-faint hover:text-muted"
                  }`}
                >
                  {state === "done" ? <CheckIcon className="size-4" /> : i + 1}
                </button>
                <span
                  className={`hidden max-w-[9ch] truncate text-[12px] leading-none sm:block ${
                    state === "todo" ? "text-faint" : "font-medium text-foreground"
                  }`}
                >
                  {title}
                </span>
              </li>
              {i < last && (
                <li
                  aria-hidden
                  className={`mt-4 h-0.5 min-w-[12px] flex-1 rounded-full transition-colors ${
                    i < current ? "bg-accent" : "bg-border"
                  }`}
                />
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
