import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { sceneBg, theme } from "./theme";

// ─────────────────────────────────────────────────────────────────────────
// Motion language
// One shared set of curves so every scene moves the same way.
//  - EASE_OUT: expo-style ease-out for entrances & moves (never linear).
//  - EASE_IO:  symmetric ease-in-out for reversible motion (fades, dissolves).
// ─────────────────────────────────────────────────────────────────────────
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IO = Easing.bezier(0.65, 0, 0.35, 1);

// Standard entrance spring: smooth, a whisper of life, no distracting bounce
// (high damping per Remotion guidance).
export const ENTER_SPRING = { damping: 26, stiffness: 140, mass: 0.9 } as const;

/** Eased interpolate with clamped extrapolation — the workhorse for moves. */
export function ease(
  frame: number,
  range: [number, number],
  out: [number, number],
  easing = EASE_OUT
) {
  return interpolate(frame, range, out, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** Eased fade-in over [a, b]. */
export function fadeIn(frame: number, a: number, b: number) {
  return ease(frame, [a, b], [0, 1]);
}

/**
 * Spring-driven entrance. Returns opacity + translateY + scale, ready to drop
 * onto a style. `dist` is the lift distance, `delay` the local start frame.
 */
export function useEnter(delay = 0, dist = 24, config = ENTER_SPRING) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config });
  return {
    opacity: interpolate(s, [0, 1], [0, 1]),
    translateY: interpolate(s, [0, 1], [dist, 0]),
    scale: interpolate(s, [0, 1], [0.96, 1]),
    progress: s,
  };
}

/** Convenience: a spring progress 0→1 for a local delay. */
export function useSpringAt(delay = 0, config = ENTER_SPRING) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
}

/** Reveal `text` character-by-character from a local start frame. */
export function useTyped(text: string, start: number, cps = 1.7) {
  const frame = useCurrentFrame();
  const shown = Math.max(0, Math.floor((frame - start) * cps));
  return text.slice(0, Math.min(text.length, shown));
}

/** Blinking block caret state (on/off) for terminals. */
export function useCaret(period = 16) {
  const frame = useCurrentFrame();
  return Math.floor(frame / (period / 2)) % 2 === 0;
}

export const isAfter = (frame: number, start: number) => frame >= start;

// ─────────────────────────────────────────────────────────────────────────
// Scene wrapper — fades + gently lifts contents in/out for clean crossfades
// between overlapping Series sequences (no hard cuts, no cheesy wipes).
// ─────────────────────────────────────────────────────────────────────────
export const Scene: React.FC<{
  length: number;
  children: React.ReactNode;
  enter?: number;
  exit?: number;
}> = ({ length, children, enter = 16, exit = 16 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, enter, length - exit, length],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE_IO }
  );
  const lift = ease(frame, [0, enter], [14, 0]);
  const drift = ease(frame, [length - exit, length], [0, -10]);
  return (
    <AbsoluteFill style={{ ...sceneBg, opacity }}>
      <AbsoluteFill style={{ transform: `translateY(${lift + drift}px)` }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────────────────────────────────

/** Small uppercase label that sits above a headline. */
export const Kicker: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 2,
}) => {
  const e = useEnter(delay, 10);
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px)`,
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: theme.amber,
        fontFamily: theme.fontMono,
        fontSize: 20,
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 7,
          background: theme.amber,
          boxShadow: `0 0 14px ${theme.amberGlow}`,
        }}
      />
      {children}
    </div>
  );
};

/** macOS/Windows-agnostic window chrome with three dots + a title. */
export const WindowChrome: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  width?: number | string;
  accent?: boolean;
  style?: React.CSSProperties;
}> = ({ title, children, width = 980, accent, style }) => {
  return (
    <div
      style={{
        width,
        borderRadius: 16,
        overflow: "hidden",
        background: "rgba(6,6,9,0.92)",
        border: `1px solid ${accent ? "rgba(250,204,21,0.35)" : theme.lineStrong}`,
        boxShadow: accent
          ? `0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(250,204,21,0.06), 0 0 60px rgba(250,204,21,0.10)`
          : "0 40px 120px rgba(0,0,0,0.6)",
        ...style,
      }}
    >
      <div
        style={{
          height: 46,
          background: "rgba(255,255,255,0.035)",
          borderBottom: `1px solid ${theme.line}`,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 18px",
        }}
      >
        <Dot c="#ff5f57" />
        <Dot c="#febc2e" />
        <Dot c="#28c840" />
        <span
          style={{
            marginLeft: 12,
            color: theme.inkMute,
            fontFamily: theme.fontMono,
            fontSize: 15,
            letterSpacing: 0.3,
          }}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );
};

const Dot: React.FC<{ c: string }> = ({ c }) => (
  <span style={{ width: 13, height: 13, borderRadius: 13, background: c }} />
);

/** A crisp macOS-style cursor arrow (SVG), positioned by its owner. */
export const Cursor: React.FC<{
  x: number;
  y: number;
  opacity?: number;
  pressed?: boolean;
}> = ({ x, y, opacity = 1, pressed = false }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      opacity,
      transform: `scale(${pressed ? 0.86 : 1})`,
      transformOrigin: "4px 4px",
      filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.55))",
      pointerEvents: "none",
      zIndex: 50,
    }}
  >
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3.5 L5 19.5 L9.2 15.4 L12 21.5 L14.6 20.3 L11.8 14.3 L17.6 14.3 Z"
        fill="#fff"
        stroke="#111"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/** Expanding click ripple at a point. `p` is 0→1 progress of the ripple. */
export const ClickRipple: React.FC<{ x: number; y: number; p: number }> = ({
  x,
  y,
  p,
}) => {
  if (p <= 0 || p >= 1) return null;
  const size = interpolate(p, [0, 1], [6, 52]);
  const opacity = interpolate(p, [0, 1], [0.55, 0]);
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        border: `2px solid ${theme.amber}`,
        opacity,
        zIndex: 49,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Overlapping sequence used by the Series wrapper.
 * (Kept as a thin alias so scene files stay declarative.)
 */
export const SceneSeq: React.FC<{
  from: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ from, durationInFrames, children }) => (
  <Sequence from={from} durationInFrames={durationInFrames} layout="none">
    {children}
  </Sequence>
);
