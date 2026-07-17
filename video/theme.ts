import React from "react";

// ─────────────────────────────────────────────────────────────────────────
// WinReach brand tokens for the demo video.
// Near-black canvas + a single crisp amber accent. Everything else is a
// restrained zinc gray scale so the amber does the talking (one accent, one
// idea per scene). An 8px spacing scale keeps rhythm consistent.
// ─────────────────────────────────────────────────────────────────────────
export const theme = {
  // Canvas — near-black, very slightly cool.
  bg0: "#08080a",
  bg1: "#0b0b0f",
  bg2: "#101017",

  // Ink (zinc scale).
  ink: "#fafafa",
  inkSoft: "#c4c7d0",
  inkMute: "#8a8f9c",
  inkFaint: "#5a5f6d",

  // Hairlines / surfaces.
  line: "rgba(255,255,255,0.09)",
  lineStrong: "rgba(255,255,255,0.16)",
  surface: "rgba(255,255,255,0.028)",
  surfaceUp: "rgba(255,255,255,0.05)",

  // The accent — crisp amber. Used sparingly and deliberately.
  amber: "#facc15",
  amberDim: "#d4a90f",
  amberSoft: "rgba(250,204,21,0.14)",
  amberGlow: "rgba(250,204,21,0.30)",

  // Supporting hues (terminal syntax + status only, never decorative).
  green: "#4ade80",
  cyan: "#38bdf8",
  violet: "#a78bfa",
  rose: "#fb7185",

  // Type.
  fontSans:
    "'Segoe UI Variable', 'Segoe UI', Inter, system-ui, -apple-system, Arial, sans-serif",
  fontMono:
    "'Cascadia Code', 'Cascadia Mono', 'JetBrains Mono', Consolas, 'SFMono-Regular', ui-monospace, monospace",
} as const;

// 8px spacing scale.
export const sp = (n: number) => n * 8;

// Shared canvas: near-black with one faint amber aura up top for depth
// (subtle, not cheesy).
export const sceneBg: React.CSSProperties = {
  background: `
    radial-gradient(130% 80% at 50% -10%, rgba(250,204,21,0.06) 0%, rgba(250,204,21,0) 42%),
    radial-gradient(120% 120% at 50% 8%, ${theme.bg2} 0%, ${theme.bg1} 46%, ${theme.bg0} 100%)
  `,
  color: theme.ink,
  fontFamily: theme.fontSans,
  WebkitFontSmoothing: "antialiased",
};
