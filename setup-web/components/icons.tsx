// Deliberately tiny inline SVG set. Only *functional* icons live here (copy
// feedback); everything decorative is carried by type and spacing instead.
// No icon library dependency.

type IconProps = { className?: string };

function base(className?: string) {
  return {
    xmlns: "http://www.w3.org/2000/svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
