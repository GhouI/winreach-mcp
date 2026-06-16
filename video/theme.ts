import React from "react";

// Shared design tokens for the WinBridge demo video.
// One consistent palette + type scale across every scene.
export const theme = {
  bg0: "#0b0e16",
  bg1: "#0f1320",
  bg2: "#12182a",
  ink: "#f5f7fc",
  inkSoft: "#aeb9cf",
  inkFaint: "#6b7795",
  line: "rgba(255,255,255,0.10)",

  // Accents
  teal: "#56d4c2",
  tealSoft: "rgba(86,212,194,0.16)",
  amber: "#f5b54a",
  amberSoft: "rgba(245,181,74,0.16)",
  rose: "#ec5a6f",
  roseSoft: "rgba(236,90,111,0.16)",
  green: "#5ee08a",
  blue: "#7aa2ff",

  fontSans: "Inter, 'Segoe UI', system-ui, Arial, sans-serif",
  fontMono: "'Cascadia Code', 'Cascadia Mono', Consolas, 'SFMono-Regular', monospace",
} as const;

export const sceneBg: React.CSSProperties = {
  background: `radial-gradient(120% 90% at 50% 0%, ${theme.bg2} 0%, ${theme.bg1} 45%, ${theme.bg0} 100%)`,
  color: theme.ink,
  fontFamily: theme.fontSans,
};
