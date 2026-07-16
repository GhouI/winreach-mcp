// Small inline SVG icon set (stroke-based, lucide-style) so we avoid an icon
// library dependency. All icons inherit `currentColor` and size via className.

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

export function TerminalIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m5 8 4 4-4 4" />
      <path d="M12 17h7" />
    </svg>
  );
}

export function ServerIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M7 7.5h.01" />
      <path d="M7 16.5h.01" />
    </svg>
  );
}

export function KeyIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="8" cy="16" r="4" />
      <path d="m10.85 13.15 8.4-8.4" />
      <path d="m18 6 2 2" />
      <path d="m15 9 2 2" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3 5 5.8V11c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V5.8Z" />
      <path d="m9.3 11.6 2 2 3.4-3.7" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 8h10" />
      <path d="M18 8h2" />
      <circle cx="16" cy="8" r="2" />
      <path d="M4 16h2" />
      <path d="M10 16h10" />
      <circle cx="8" cy="16" r="2" />
    </svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 5h16l-6.5 7.5V18l-3 2v-7.5Z" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M10.29 4.3 2.9 17a2 2 0 0 0 1.72 3h14.76a2 2 0 0 0 1.72-3L13.71 4.3a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </svg>
  );
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

export function SparklesIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M11 4.5 12.6 8.9 17 10.5l-4.4 1.6L11 16.5 9.4 12.1 5 10.5l4.4-1.6Z" />
      <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" />
    </svg>
  );
}

export function LockIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function ClipboardCheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
      <path d="m9.5 13 2 2 3.5-4" />
    </svg>
  );
}

export function BotIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="8" width="16" height="11" rx="2" />
      <path d="M12 8V5" />
      <path d="M12 5h.01" />
      <path d="M9 13h.01" />
      <path d="M15 13h.01" />
      <path d="M9 16h6" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M9 15 15 9" />
      <path d="M10.5 6.5 12 5a4 4 0 0 1 5.7 5.7l-1.6 1.5" />
      <path d="m7.9 11.8-1.6 1.5A4 4 0 0 0 12 19l1.5-1.5" />
    </svg>
  );
}
