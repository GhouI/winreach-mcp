import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "./theme";
import { ClickRipple, Cursor, EASE_OUT, ease, fadeIn, useCaret, useTyped } from "./helpers";

// ─────────────────────────────────────────────────────────────────────────
// MockDesktop — a self-contained, realistic Windows "screen": wallpaper, an
// editor window with a live-typed line, a centered taskbar, and an animated
// cursor that moves → clicks → lets text type. Reused by the hook, the
// computer-use montage beat, and the LinkedIn cover.
// ─────────────────────────────────────────────────────────────────────────
export const MockDesktop: React.FC<{
  width: number;
  height: number;
  text: string;
  typeStart: number;
  cps?: number;
  cursorAppear?: number;
  moveStart?: number;
  moveEnd?: number;
  clickAt?: number;
  editorTitle?: string;
  actions?: { label: string; at: number }[];
  taskbarTime?: string;
}> = ({
  width: W,
  height: H,
  text,
  typeStart,
  cps = 1.6,
  cursorAppear = 2,
  moveStart = 6,
  moveEnd = 30,
  clickAt = 34,
  editorTitle = "agent-notes.txt — Notepad",
  actions,
  taskbarTime = "9:41",
}) => {
  const frame = useCurrentFrame();

  const editor = { left: W * 0.13, top: H * 0.16, width: W * 0.74 };
  const start = { x: W * 0.82, y: H * 0.13 };
  const target = { x: editor.left + 40, y: editor.top + 96 };

  const t = ease(frame, [moveStart, moveEnd], [0, 1], EASE_OUT);
  const curX = interpolate(t, [0, 1], [start.x, target.x]);
  const curY = interpolate(t, [0, 1], [start.y, target.y]);
  const pressed = frame >= clickAt && frame < clickAt + 8;
  const ripple = interpolate(frame, [clickAt, clickAt + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cursorVisible = fadeIn(frame, cursorAppear, cursorAppear + 6);

  const typed = useTyped(text, typeStart, cps);
  const caret = useCaret(18);

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        overflow: "hidden",
        background:
          "radial-gradient(120% 100% at 22% 0%, #14213a 0%, #0c1120 55%, #070a12 100%)",
      }}
    >
      {/* editor window */}
      <div
        style={{
          position: "absolute",
          left: editor.left,
          top: editor.top,
          width: editor.width,
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(10,11,16,0.98)",
          border: `1px solid ${theme.lineStrong}`,
          boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            background: "rgba(255,255,255,0.045)",
            borderBottom: `1px solid ${theme.line}`,
          }}
        >
          <span style={{ width: 12, height: 12, borderRadius: 12, background: "#ff5f57" }} />
          <span style={{ width: 12, height: 12, borderRadius: 12, background: "#febc2e" }} />
          <span style={{ width: 12, height: 12, borderRadius: 12, background: "#28c840" }} />
          <span
            style={{
              marginLeft: 10,
              fontFamily: theme.fontMono,
              fontSize: 15,
              color: theme.inkMute,
            }}
          >
            {editorTitle}
          </span>
        </div>
        <div
          style={{
            padding: "24px 22px",
            minHeight: H * 0.34,
            fontFamily: theme.fontMono,
            fontSize: 24,
            lineHeight: 1.55,
            color: theme.ink,
            textAlign: "left",
          }}
        >
          {typed}
          {frame >= typeStart && caret && <span style={{ color: theme.amber }}>▋</span>}
        </div>
      </div>

      {/* action chips (optional) */}
      {actions && (
        <div
          style={{
            position: "absolute",
            right: 22,
            top: 22,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          {actions.map((a, i) => {
            const o = fadeIn(frame, a.at, a.at + 8);
            const active = frame >= a.at;
            if (!active) return null;
            return (
              <div
                key={i}
                style={{
                  opacity: o,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  borderRadius: 9,
                  background: theme.amberSoft,
                  border: `1px solid rgba(250,204,21,0.45)`,
                  fontFamily: theme.fontMono,
                  fontSize: 16,
                  color: theme.ink,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 7,
                    background: theme.amber,
                    boxShadow: `0 0 10px ${theme.amberGlow}`,
                  }}
                />
                {a.label}
              </div>
            );
          })}
        </div>
      )}

      {/* taskbar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 52,
          background: "rgba(10,12,20,0.72)",
          borderTop: `1px solid ${theme.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
        }}
      >
        {[theme.cyan, theme.inkSoft, theme.inkSoft, theme.amber].map((c, i) => (
          <span
            key={i}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: i === 0 ? c : theme.surfaceUp,
              border: `1px solid ${theme.line}`,
            }}
          />
        ))}
        <span
          style={{
            position: "absolute",
            right: 18,
            fontFamily: theme.fontMono,
            fontSize: 15,
            color: theme.inkMute,
          }}
        >
          {taskbarTime}
        </span>
      </div>

      {/* click ripple + cursor */}
      <ClickRipple x={target.x} y={target.y} p={ripple} />
      <Cursor x={curX} y={curY} opacity={cursorVisible} pressed={pressed} />
    </div>
  );
};
