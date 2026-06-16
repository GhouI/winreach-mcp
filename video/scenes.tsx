import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";
import { fadeIn, isAfter, rise, useTyped } from "./helpers";

const center: React.CSSProperties = {
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
};

// ─────────────────────────────────────────────────────────────────────────
// Small shared bits
// ─────────────────────────────────────────────────────────────────────────

const Kicker: React.FC<{ children: React.ReactNode; color: string; o: number }> = ({
  children,
  color,
  o,
}) => (
  <div
    style={{
      opacity: o,
      display: "inline-block",
      color,
      border: `1px solid ${color}55`,
      background: `${color}14`,
      padding: "8px 16px",
      borderRadius: 999,
      fontSize: 18,
      fontWeight: 700,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────
// Scene 1 — The Problem
// ─────────────────────────────────────────────────────────────────────────

export const SceneProblem: React.FC = () => {
  const frame = useCurrentFrame();

  const k = fadeIn(frame, 4, 18);
  const h = rise(frame, 14, 34);
  const sub = rise(frame, 30, 50);

  // The RDP "trap" frame draws itself in, then a faint lock settles on it.
  const draw = interpolate(frame, [40, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const lock = fadeIn(frame, 66, 84);

  return (
    <AbsoluteFill style={{ ...center, flexDirection: "column", padding: 80 }}>
      <Kicker color={theme.rose} o={k}>
        The problem
      </Kicker>

      <h1
        style={{
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
          fontSize: 56,
          lineHeight: 1.08,
          fontWeight: 800,
          margin: "26px 0 0",
          maxWidth: 1000,
          letterSpacing: -0.5,
        }}
      >
        AI agents can code, run terminals,
        <br />
        use tools&nbsp;
        <span style={{ color: theme.inkFaint }}>— until they hit Windows.</span>
      </h1>

      <p
        style={{
          opacity: sub.opacity,
          transform: `translateY(${sub.translateY}px)`,
          fontSize: 24,
          color: theme.inkSoft,
          margin: "22px 0 0",
          maxWidth: 760,
          lineHeight: 1.4,
        }}
      >
        RDP traps them behind a GUI — squinting at screenshots, nudging a mouse.
      </p>

      {/* The trapped-in-a-GUI motif: a mock RDP window that draws itself in,
          then a lock settles over it. */}
      <div
        style={{
          marginTop: 48,
          width: 480,
          height: 150,
          position: "relative",
          // draw effect: window reveals left-to-right
          clipPath: `inset(0 ${(1 - draw) * 100}% 0 0 round 12px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            border: `2px solid ${theme.rose}66`,
            borderRadius: 12,
            overflow: "hidden",
            background: "rgba(255,255,255,0.02)",
            boxShadow: `0 0 44px ${theme.roseSoft}`,
          }}
        >
          {/* fake RDP title bar */}
          <div
            style={{
              height: 30,
              background: "rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.rose }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.inkFaint }} />
            <span style={{ width: 9, height: 9, borderRadius: 9, background: theme.inkFaint }} />
            <span style={{ fontSize: 13, color: theme.inkFaint, marginLeft: 6 }}>
              Remote Desktop — win-build-01
            </span>
          </div>
          {/* blurred desktop content the agent can only stare at */}
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 9, filter: "blur(0.4px)" }}>
            <div style={{ height: 10, width: "70%", borderRadius: 5, background: "rgba(255,255,255,0.10)" }} />
            <div style={{ height: 10, width: "52%", borderRadius: 5, background: "rgba(255,255,255,0.08)" }} />
            <div style={{ height: 10, width: "61%", borderRadius: 5, background: "rgba(255,255,255,0.06)" }} />
          </div>
        </div>

        {/* lock + friction caption settle over the window */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            opacity: lock,
            background: "rgba(11,14,22,0.55)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 34 }}>🔒</div>
          <div style={{ fontFamily: theme.fontMono, fontSize: 16, color: theme.rose, fontWeight: 600 }}>
            screenshots&nbsp;·&nbsp;mouse&nbsp;·&nbsp;RDP
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Scene 2 — The Solution (pipeline)
// ─────────────────────────────────────────────────────────────────────────

const PipeNode: React.FC<{
  title: string;
  sub: string;
  color: string;
  frame: number;
  appear: number;
  emphasize?: boolean;
}> = ({ title, sub, color, frame, appear, emphasize }) => {
  const { fps } = useVideoConfig();
  // Spring-driven entrance: physically natural pop preferred by Remotion docs.
  const s = spring({
    frame: frame - appear,
    fps,
    config: { damping: 16, stiffness: 110, mass: 0.8 },
  });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const translateY = interpolate(s, [0, 1], [22, 0]);
  const scale = interpolate(s, [0, 1], [0.92, 1]);
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        width: 250,
        padding: "26px 22px",
        borderRadius: 16,
        background: emphasize ? `${color}1f` : "rgba(255,255,255,0.03)",
        border: `1.5px solid ${emphasize ? color : "rgba(255,255,255,0.12)"}`,
        boxShadow: emphasize ? `0 0 44px ${color}33` : "none",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, color: emphasize ? color : theme.ink }}>
        {title}
      </div>
      <div style={{ fontSize: 17, color: theme.inkSoft, marginTop: 8, lineHeight: 1.35 }}>
        {sub}
      </div>
    </div>
  );
};

const Connector: React.FC<{ frame: number; appear: number; color: string }> = ({
  frame,
  appear,
  color,
}) => {
  const grow = interpolate(frame, [appear, appear + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <div style={{ width: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", position: "relative", height: 22 }}>
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 0,
            height: 3,
            width: `${grow * 100}%`,
            background: color,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 4,
            left: `calc(${grow * 100}% - 8px)`,
            width: 0,
            height: 0,
            borderTop: "8px solid transparent",
            borderBottom: "8px solid transparent",
            borderLeft: `9px solid ${color}`,
            opacity: grow,
          }}
        />
      </div>
    </div>
  );
};

export const SceneSolution: React.FC = () => {
  const frame = useCurrentFrame();
  const k = fadeIn(frame, 4, 18);
  const h = rise(frame, 12, 32);

  return (
    <AbsoluteFill style={{ ...center, flexDirection: "column", padding: 80 }}>
      <Kicker color={theme.teal} o={k}>
        The solution
      </Kicker>

      <h1
        style={{
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
          fontSize: 50,
          fontWeight: 800,
          margin: "24px 0 8px",
          maxWidth: 900,
          letterSpacing: -0.5,
          lineHeight: 1.1,
        }}
      >
        WinBridge makes Windows an{" "}
        <span style={{ color: theme.teal }}>MCP-native</span> target.
      </h1>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 56,
        }}
      >
        <PipeNode
          frame={frame}
          appear={40}
          title="AI Agent"
          sub="Codex · Claude Code"
          color={theme.blue}
        />
        <Connector frame={frame} appear={56} color={theme.inkFaint} />
        <PipeNode
          frame={frame}
          appear={62}
          title="WinBridge"
          sub="MCP server · PowerShell tools"
          color={theme.teal}
          emphasize
        />
        <Connector frame={frame} appear={78} color={theme.inkFaint} />
        <PipeNode
          frame={frame}
          appear={84}
          title="Windows"
          sub="Headless PowerShell"
          color={theme.amber}
        />
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Scene 3 — The one command (hero terminal)
// ─────────────────────────────────────────────────────────────────────────

type TLine =
  | { kind: "cmd"; text: string; start: number }
  | { kind: "out"; text: string; at: number; color?: string };

const TUNNEL = "https://swift-river-7s3d.trycloudflare.com/mcp";

const heroLines: TLine[] = [
  { kind: "cmd", text: "$env:WINBRIDGE_TUNNEL = 'cloudflare'", start: 18 },
  { kind: "cmd", text: "npm run dev", start: 62 },
  { kind: "out", text: "WinBridge MCP listening on http://127.0.0.1:7573/mcp", at: 90 },
  { kind: "out", text: "Cloudflare tunnel ready:", at: 108 },
  { kind: "out", text: TUNNEL, at: 120, color: theme.green },
];

const TypedCmd: React.FC<{ text: string; start: number }> = ({ text, start }) => {
  const frame = useCurrentFrame();
  const typed = useTyped(text, start, 1.8);
  const typing = isAfter(frame, start) && typed.length < text.length;
  const caretOn = Math.floor(frame / 8) % 2 === 0;
  if (!isAfter(frame, start)) return null;
  return (
    <div style={{ display: "flex", gap: 12, whiteSpace: "pre" }}>
      <span style={{ color: theme.teal, fontWeight: 700 }}>PS&gt;</span>
      <span>
        {typed}
        {(typing || caretOn) && (
          <span style={{ color: theme.teal, opacity: typing ? 1 : caretOn ? 0.8 : 0 }}>▋</span>
        )}
      </span>
    </div>
  );
};

const OutLine: React.FC<{ text: string; at: number; color?: string }> = ({ text, at, color }) => {
  const frame = useCurrentFrame();
  const o = fadeIn(frame, at, at + 8);
  if (!isAfter(frame, at)) return null;
  return (
    <div
      style={{
        opacity: o,
        margin: "4px 0 4px 40px",
        color: color ?? theme.inkSoft,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        fontWeight: color ? 700 : 400,
      }}
    >
      {text}
    </div>
  );
};

export const SceneCommand: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = fadeIn(frame, 4, 18);
  const h = rise(frame, 10, 28);

  const termSpring = spring({ frame: frame - 14, fps, config: { damping: 18, stiffness: 90 } });
  const termScale = interpolate(termSpring, [0, 1], [0.96, 1]);
  const termOpacity = interpolate(termSpring, [0, 1], [0, 1]);

  // highlight pulse on the URL once it's printed
  const urlGlow = interpolate(frame, [128, 150], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ ...center, flexDirection: "column", padding: "56px 80px" }}>
      <Kicker color={theme.amber} o={k}>
        One command
      </Kicker>

      <h1
        style={{
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
          fontSize: 42,
          fontWeight: 800,
          margin: "20px 0 32px",
          letterSpacing: -0.5,
        }}
      >
        Publish the host to your agent — <span style={{ color: theme.amber }}>from anywhere.</span>
      </h1>

      <div
        style={{
          width: 920,
          transform: `scale(${termScale})`,
          opacity: termOpacity,
          background: "rgba(4,6,11,0.96)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 34px 90px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            height: 44,
            background: "#171c2b",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "0 18px",
          }}
        >
          <span style={{ width: 13, height: 13, borderRadius: 13, background: theme.rose }} />
          <span style={{ width: 13, height: 13, borderRadius: 13, background: theme.amber }} />
          <span style={{ width: 13, height: 13, borderRadius: 13, background: theme.green }} />
          <span style={{ color: theme.inkFaint, fontSize: 15, marginLeft: 10 }}>
            Windows PowerShell — winbridge
          </span>
        </div>
        <div
          style={{
            padding: "26px 30px",
            fontFamily: theme.fontMono,
            fontSize: 21,
            lineHeight: 1.6,
            minHeight: 240,
            position: "relative",
            textAlign: "left",
          }}
        >
          {/* glow behind the URL line */}
          <div
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: 24,
              height: 40,
              background: `${theme.green}22`,
              borderRadius: 8,
              opacity: urlGlow,
              filter: "blur(2px)",
            }}
          />
          <div style={{ position: "relative" }}>
            {heroLines.map((l, i) =>
              l.kind === "cmd" ? (
                <TypedCmd key={i} text={l.text} start={l.start} />
              ) : (
                <OutLine key={i} text={l.text} at={l.at} color={l.color} />
              )
            )}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Scene 4 — The Payoff
// ─────────────────────────────────────────────────────────────────────────

const PayoffCmd: React.FC<{
  cmd: string;
  out: string;
  appear: number;
  outAt: number;
  outColor?: string;
}> = ({ cmd, out, appear, outAt, outColor }) => {
  const frame = useCurrentFrame();
  const r = rise(frame, appear, appear + 14, 14);
  const outO = fadeIn(frame, outAt, outAt + 8);
  return (
    <div
      style={{
        opacity: r.opacity,
        transform: `translateY(${r.translateY}px)`,
        fontFamily: theme.fontMono,
        fontSize: 22,
        lineHeight: 1.5,
        marginBottom: 18,
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <span style={{ color: theme.teal, fontWeight: 700 }}>$</span>
        <span>{cmd}</span>
      </div>
      <div style={{ opacity: outO, marginLeft: 26, color: outColor ?? theme.green, fontWeight: 600 }}>
        {out}
      </div>
    </div>
  );
};

export const ScenePayoff: React.FC = () => {
  const frame = useCurrentFrame();
  const k = fadeIn(frame, 4, 18);
  const h = rise(frame, 12, 30);

  const tagline = rise(frame, 96, 120, 18);

  return (
    <AbsoluteFill style={{ ...center, flexDirection: "column", padding: 80 }}>
      <Kicker color={theme.green} o={k}>
        The payoff
      </Kicker>

      <h1
        style={{
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
          fontSize: 44,
          fontWeight: 800,
          margin: "22px 0 36px",
          letterSpacing: -0.5,
        }}
      >
        The agent runs real commands — <span style={{ color: theme.green }}>headlessly.</span>
      </h1>

      <div
        style={{
          width: 760,
          background: "rgba(4,6,11,0.6)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14,
          padding: "28px 34px",
          textAlign: "left",
        }}
      >
        <PayoffCmd cmd="npm run client -- exec hostname" out="win-build-01" appear={34} outAt={54} />
        <PayoffCmd
          cmd="npm run client -- exec whoami"
          out="win-build-01\agent"
          appear={64}
          outAt={84}
          outColor={theme.blue}
        />
      </div>

      <div
        style={{
          opacity: tagline.opacity,
          transform: `translateY(${tagline.translateY}px)`,
          marginTop: 40,
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: -0.3,
        }}
      >
        No screenshots. No RDP.{" "}
        <span style={{ color: theme.teal }}>Just MCP tools — reachable from anywhere.</span>
      </div>
    </AbsoluteFill>
  );
};
