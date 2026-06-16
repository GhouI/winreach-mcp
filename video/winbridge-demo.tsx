import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const TUNNEL_HOST = "swift-river-7s3d.trycloudflare.com";

type Line =
  | { at: number; kind: "prompt"; text: string }
  | { at: number; kind: "output"; text: string; accent?: boolean };

const lines: Line[] = [
  { at: 70, kind: "prompt", text: "$env:WINBRIDGE_TOKEN = '<redacted>'" },
  { at: 90, kind: "prompt", text: "$env:WINBRIDGE_TUNNEL = 'cloudflare'" },
  { at: 108, kind: "prompt", text: "npm run dev" },
  { at: 132, kind: "output", text: "WinBridge MCP listening at http://127.0.0.1:7573/mcp" },
  { at: 150, kind: "output", text: `Cloudflare tunnel ready: https://${TUNNEL_HOST}`, accent: true },
  { at: 168, kind: "output", text: `Public MCP endpoint: https://${TUNNEL_HOST}/mcp`, accent: true },
  { at: 215, kind: "prompt", text: "npm run client -- exec hostname" },
  { at: 233, kind: "output", text: "win-build-01" },
  { at: 285, kind: "prompt", text: "npm run client -- --url win-1 --url win-2 exec hostname" },
  { at: 303, kind: "output", text: "win-1: win-build-01    win-2: win-test-02" }
];

export function WinBridgeDemo() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const glow = spring({ frame, fps, config: { damping: 18, stiffness: 60 } });
  const subtitleOpacity = interpolate(frame, [20, 45], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={styles.canvas}>
      <div style={styles.grid} />
      <div style={{ ...styles.hero, transform: `translateY(${interpolate(glow, [0, 1], [18, 0])}px)` }}>
        <div style={styles.badge}>MCP for Windows PowerShell</div>
        <h1 style={styles.title}>AI agents can code. Windows RDP traps them behind a GUI.</h1>
        <p style={{ ...styles.subtitle, opacity: subtitleOpacity }}>
          WinBridge turns Windows into an MCP-native shell target — and publishes it in one command.
        </p>
      </div>
      <NetworkDiagram frame={frame} />
      <Terminal frame={frame} />
      <div style={styles.footer}>Agent {"->"} Cloudflare tunnel {"->"} WinBridge {"->"} headless PowerShell</div>
    </AbsoluteFill>
  );
}

function NetworkDiagram({ frame }: { frame: number }) {
  const pulse = interpolate(Math.sin(frame / 8), [-1, 1], [0.35, 1]);
  return (
    <div style={styles.diagram}>
      <Node label="Agent" detail="Codex or Claude Code" active={frame > 35} />
      <Line active={frame > 52} pulse={pulse} />
      <Node label="Tunnel" detail="*.trycloudflare.com" active={frame > 60} cloud />
      <Line active={frame > 80} pulse={pulse} />
      <Node label="WinBridge" detail="Streamable HTTP MCP" active={frame > 88} accent />
      <Line active={frame > 110} pulse={pulse} />
      <Node label="Windows" detail="PowerShell, headless" active={frame > 118} />
    </div>
  );
}

function Node({
  label,
  detail,
  active,
  accent = false,
  cloud = false
}: {
  label: string;
  detail: string;
  active: boolean;
  accent?: boolean;
  cloud?: boolean;
}) {
  const border = accent ? "#e43f5a" : cloud ? "#f5a742" : "#5dd6c5";
  const shadow = accent ? "rgba(228,63,90,.34)" : cloud ? "rgba(245,167,66,.30)" : "rgba(93,214,197,.24)";
  return (
    <div
      style={{
        ...styles.node,
        opacity: active ? 1 : 0.32,
        borderColor: border,
        boxShadow: active ? `0 0 28px ${shadow}` : "none"
      }}
    >
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Line({ active, pulse }: { active: boolean; pulse: number }) {
  return (
    <div style={styles.lineWrap}>
      <div style={{ ...styles.line, opacity: active ? pulse : 0.15 }} />
    </div>
  );
}

function Terminal({ frame }: { frame: number }) {
  const visible = lines.filter((line) => frame >= line.at);
  return (
    <div style={styles.terminal}>
      <div style={styles.terminalBar}>
        <span style={styles.dotRed} />
        <span style={styles.dotYellow} />
        <span style={styles.dotGreen} />
        <span style={styles.terminalTitle}>WinBridge — one command to publish a Windows host</span>
      </div>
      <div style={styles.terminalBody}>
        {visible.map((line) =>
          line.kind === "prompt" ? (
            <div key={line.text} style={styles.prompt}>
              <span style={styles.promptMark}>PS&gt;</span>
              <span>{line.text}</span>
            </div>
          ) : (
            <pre key={line.text} style={{ ...styles.result, color: line.accent ? "#5dd67a" : "#e7edf8" }}>
              {line.text}
            </pre>
          )
        )}
        {frame > 345 ? <div style={styles.success}>No screenshots. No RDP. Just MCP tools — reachable from anywhere.</div> : null}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  canvas: {
    background: "linear-gradient(135deg, #10131b 0%, #161a24 45%, #101820 100%)",
    color: "#f6f7fb",
    fontFamily: "Inter, Segoe UI, Arial, sans-serif",
    overflow: "hidden"
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    maskImage: "radial-gradient(circle at 50% 35%, black, transparent 72%)"
  },
  hero: {
    position: "absolute",
    left: 64,
    top: 50,
    width: 720
  },
  badge: {
    display: "inline-block",
    color: "#5dd6c5",
    border: "1px solid rgba(93,214,197,.45)",
    padding: "8px 12px",
    borderRadius: 6,
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 18
  },
  title: {
    fontSize: 42,
    lineHeight: 1.05,
    margin: 0,
    letterSpacing: 0,
    maxWidth: 720
  },
  subtitle: {
    fontSize: 26,
    lineHeight: 1.25,
    color: "#c6d0df",
    marginTop: 18,
    maxWidth: 760
  },
  diagram: {
    position: "absolute",
    top: 286,
    left: 64,
    display: "flex",
    alignItems: "center",
    gap: 12
  },
  node: {
    width: 168,
    minHeight: 72,
    border: "2px solid #5dd6c5",
    borderRadius: 8,
    padding: "16px 18px",
    background: "rgba(20,24,34,.88)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    transition: "opacity .2s",
    fontSize: 22
  },
  lineWrap: {
    width: 48,
    height: 2,
    display: "flex",
    alignItems: "center"
  },
  line: {
    width: "100%",
    height: 3,
    background: "#e43f5a"
  },
  terminal: {
    position: "absolute",
    left: 64,
    right: 64,
    bottom: 40,
    height: 286,
    background: "rgba(6, 9, 13, .92)",
    border: "1px solid rgba(255,255,255,.16)",
    borderRadius: 8,
    overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,.42)"
  },
  terminalBar: {
    height: 40,
    background: "#202633",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 16px"
  },
  terminalTitle: {
    color: "#9fb0c6",
    fontSize: 16,
    marginLeft: 10
  },
  dotRed: { width: 12, height: 12, borderRadius: 12, background: "#e43f5a" },
  dotYellow: { width: 12, height: 12, borderRadius: 12, background: "#f5c542" },
  dotGreen: { width: 12, height: 12, borderRadius: 12, background: "#5dd67a" },
  terminalBody: {
    padding: "16px 22px",
    fontFamily: "Cascadia Mono, Consolas, monospace",
    fontSize: 19,
    lineHeight: 1.36
  },
  prompt: {
    display: "flex",
    gap: 12,
    whiteSpace: "pre-wrap"
  },
  promptMark: {
    color: "#5dd6c5"
  },
  result: {
    margin: "2px 0 8px 44px",
    font: "inherit",
    whiteSpace: "pre-wrap"
  },
  success: {
    color: "#5dd67a",
    marginTop: 6,
    fontWeight: 700
  },
  footer: {
    position: "absolute",
    right: 64,
    top: 70,
    width: 300,
    color: "#c6d0df",
    fontSize: 23,
    lineHeight: 1.28,
    textAlign: "right"
  }
};
