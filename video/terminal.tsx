import React from "react";
import { useCurrentFrame } from "remotion";
import { theme } from "./theme";
import { fadeIn, isAfter, useCaret, useEnter, useTyped } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────
// Terminal atoms — a real-looking shell. Monospace, generous line-height,
// left-aligned, restrained PowerShell syntax colors.
// ─────────────────────────────────────────────────────────────────────────

export const TermBody: React.FC<{
  children: React.ReactNode;
  fontSize?: number;
  minHeight?: number;
  style?: React.CSSProperties;
}> = ({ children, fontSize = 21, minHeight = 0, style }) => (
  <div
    style={{
      padding: "26px 30px",
      fontFamily: theme.fontMono,
      fontSize,
      lineHeight: 1.65,
      textAlign: "left",
      minHeight,
      color: theme.inkSoft,
      ...style,
    }}
  >
    {children}
  </div>
);

/** A typed command line with a colored prompt and a blinking caret. */
export const CmdLine: React.FC<{
  prompt?: React.ReactNode;
  promptColor?: string;
  text: string;
  start: number;
  cps?: number;
  caretIdle?: boolean;
  render?: (typed: string) => React.ReactNode;
}> = ({
  prompt = "PS>",
  promptColor = theme.amber,
  text,
  start,
  cps = 1.9,
  caretIdle = false,
  render,
}) => {
  const frame = useCurrentFrame();
  const typed = useTyped(text, start, cps);
  const typing = isAfter(frame, start) && typed.length < text.length;
  const caret = useCaret();
  const showCaret = typing || (caretIdle && caret);
  if (!isAfter(frame, start)) return null;
  return (
    <div style={{ display: "flex", gap: 12, whiteSpace: "pre-wrap", color: theme.ink }}>
      <span style={{ color: promptColor, fontWeight: 700, flexShrink: 0 }}>{prompt}</span>
      <span style={{ wordBreak: "break-word" }}>
        {render ? render(typed) : typed}
        {showCaret && (
          <span
            style={{
              color: theme.amber,
              opacity: typing ? 1 : 0.85,
            }}
          >
            ▋
          </span>
        )}
      </span>
    </div>
  );
};

/** A single output line that fades in at frame `at`. */
export const OutLine: React.FC<{
  at: number;
  color?: string;
  indent?: number;
  bold?: boolean;
  children: React.ReactNode;
}> = ({ at, color, indent = 0, bold, children }) => {
  const frame = useCurrentFrame();
  const o = fadeIn(frame, at, at + 8);
  if (!isAfter(frame, at)) return null;
  return (
    <div
      style={{
        opacity: o,
        marginLeft: indent,
        color: color ?? theme.inkSoft,
        fontWeight: bold ? 700 : 400,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </div>
  );
};

/** A small "MCP tool call" chip — the agent's action, labeled. */
export const ToolCall: React.FC<{
  tool: string;
  delay: number;
  status?: "run" | "ok";
}> = ({ tool, delay, status = "run" }) => {
  const e = useEnter(delay, 8);
  const ok = status === "ok";
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px)`,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "7px 14px",
        borderRadius: 10,
        background: theme.surface,
        border: `1px solid ${ok ? "rgba(74,222,128,0.4)" : "rgba(250,204,21,0.4)"}`,
        fontFamily: theme.fontMono,
        fontSize: 16,
        color: theme.inkSoft,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 8,
          background: ok ? theme.green : theme.amber,
          boxShadow: `0 0 12px ${ok ? "rgba(74,222,128,0.6)" : theme.amberGlow}`,
        }}
      />
      <span style={{ color: theme.inkMute }}>mcp</span>
      <span style={{ color: theme.inkFaint }}>›</span>
      <span style={{ color: ok ? theme.green : theme.amber, fontWeight: 600 }}>{tool}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Very light PowerShell highlighter for command text — colorizes cmdlet
// verbs, strings, flags and pipes without a full lexer.
// ─────────────────────────────────────────────────────────────────────────
export function psHighlight(text: string): React.ReactNode {
  const tokens = text.split(/(\s+|\||"[^"]*"|'[^']*')/g).filter((t) => t !== "");
  return tokens.map((tok, i) => {
    let color: string | undefined;
    if (/^["'].*["']$/.test(tok)) color = theme.green; // strings
    else if (tok === "|") color = theme.amber; // pipe
    else if (/^-{1,2}[A-Za-z]/.test(tok)) color = theme.cyan; // flags
    else if (/^\$[A-Za-z_]/.test(tok)) color = theme.violet; // variables
    else if (/^[A-Z][a-z]+-[A-Z]/.test(tok)) color = theme.cyan; // Verb-Noun cmdlet
    return (
      <span key={i} style={color ? { color } : undefined}>
        {tok}
      </span>
    );
  });
}
