import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { sp, theme } from "./theme";
import {
  ClickRipple,
  Cursor,
  EASE_OUT,
  ease,
  fadeIn,
  isAfter,
  Kicker,
  useCaret,
  useEnter,
  useSpringAt,
  useTyped,
  WindowChrome,
} from "./helpers";
import { CmdLine, OutLine, psHighlight, TermBody, ToolCall } from "./terminal";

const center: React.CSSProperties = {
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
  flexDirection: "column",
};

// Shared headline style.
const H: React.CSSProperties = {
  fontSize: 46,
  fontWeight: 700,
  letterSpacing: -1,
  lineHeight: 1.1,
  margin: 0,
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 1 — Hook
// ═════════════════════════════════════════════════════════════════════════

const Word: React.FC<{ children: React.ReactNode; delay: number; accent?: boolean }> = ({
  children,
  delay,
  accent,
}) => {
  const e = useEnter(delay, 26);
  return (
    <span
      style={{
        display: "inline-block",
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px)`,
        color: accent ? theme.amber : theme.ink,
        marginRight: "0.28em",
      }}
    >
      {children}
    </span>
  );
};

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  const words: [string, boolean][] = [
    ["Give", false],
    ["your", false],
    ["AI", false],
    ["agent", false],
    ["its", false],
    ["own", false],
    ["Windows", true],
    ["machine.", true],
  ];
  const underline = ease(frame, [58, 82], [0, 1]);
  const sub = useEnter(70, 16);

  return (
    <AbsoluteFill style={{ ...center, padding: sp(12) }}>
      <div style={{ marginBottom: sp(4) }}>
        <Kicker delay={2}>WinReach</Kicker>
      </div>
      <h1 style={{ ...H, fontSize: 74, maxWidth: 1180, textAlign: "center" }}>
        {words.map(([w, a], i) => (
          <Word key={i} delay={8 + i * 4} accent={a}>
            {w}
          </Word>
        ))}
      </h1>
      {/* Amber underline sweeps under the accent phrase. */}
      <div
        style={{
          height: 4,
          width: 356 * underline,
          maxWidth: 356,
          background: theme.amber,
          borderRadius: 4,
          marginTop: sp(1),
          boxShadow: `0 0 18px ${theme.amberGlow}`,
          alignSelf: "center",
        }}
      />
      <p
        style={{
          opacity: sub.opacity,
          transform: `translateY(${sub.translateY}px)`,
          marginTop: sp(4),
          fontSize: 27,
          color: theme.inkMute,
          maxWidth: 820,
          lineHeight: 1.45,
        }}
      >
        Remote PowerShell, screen capture, and full desktop control —{" "}
        <span style={{ color: theme.inkSoft }}>over HTTP.</span>
      </p>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 2 — Connect over HTTP
// ═════════════════════════════════════════════════════════════════════════

const SceneHeader: React.FC<{ kicker: string; children: React.ReactNode }> = ({
  kicker,
  children,
}) => {
  const h = useEnter(12, 18);
  return (
    <div style={{ textAlign: "center", marginBottom: sp(4.5) }}>
      <Kicker delay={2}>{kicker}</Kicker>
      <h2
        style={{
          ...H,
          fontSize: 40,
          marginTop: sp(2),
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
        }}
      >
        {children}
      </h2>
    </div>
  );
};

const HandshakeBar: React.FC = () => {
  const frame = useCurrentFrame();
  const e = useEnter(96, 14);
  // A pulse travels agent → server each ~40 frames.
  const t = ((frame - 96) % 46) / 46;
  const pulseX = interpolate(t, [0, 1], [0, 1]);
  const connected = frame > 128;
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px)`,
        display: "flex",
        alignItems: "center",
        gap: sp(2),
        marginTop: sp(3),
      }}
    >
      <Node label="Your agent" sub="Claude Code" />
      <div style={{ position: "relative", width: 240, height: 40 }}>
        <div
          style={{
            position: "absolute",
            top: 19,
            left: 0,
            right: 0,
            height: 2,
            background: theme.lineStrong,
          }}
        />
        {frame > 96 && frame < 128 && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: `calc(${pulseX * 100}% - 6px)`,
              width: 12,
              height: 12,
              borderRadius: 12,
              background: theme.amber,
              boxShadow: `0 0 16px ${theme.amberGlow}`,
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: -6,
            left: "50%",
            transform: "translateX(-50%)",
            fontFamily: theme.fontMono,
            fontSize: 13,
            color: connected ? theme.green : theme.inkMute,
            whiteSpace: "nowrap",
          }}
        >
          {connected ? "200 OK · Bearer ✓" : "HTTP · Bearer …"}
        </div>
      </div>
      <Node label="WinReach" sub="win-build-01" accent />
    </div>
  );
};

const Node: React.FC<{ label: string; sub: string; accent?: boolean }> = ({
  label,
  sub,
  accent,
}) => (
  <div
    style={{
      padding: "12px 20px",
      borderRadius: 12,
      background: accent ? theme.amberSoft : theme.surface,
      border: `1px solid ${accent ? "rgba(250,204,21,0.4)" : theme.line}`,
      textAlign: "center",
      minWidth: 150,
    }}
  >
    <div style={{ fontSize: 19, fontWeight: 700, color: accent ? theme.amber : theme.ink }}>
      {label}
    </div>
    <div style={{ fontFamily: theme.fontMono, fontSize: 14, color: theme.inkMute, marginTop: 3 }}>
      {sub}
    </div>
  </div>
);

export const SceneConnect: React.FC = () => {
  const term = useEnter(14, 20);
  return (
    <AbsoluteFill style={{ ...center, padding: "56px 80px" }}>
      <SceneHeader kicker="01 · Connect">
        One line to reach your Windows box.
      </SceneHeader>

      <div
        style={{
          opacity: term.opacity,
          transform: `translateY(${term.translateY}px) scale(${term.scale})`,
        }}
      >
        <WindowChrome title="agent · terminal" width={1000} accent>
          <TermBody minHeight={196}>
            <CmdLine
              prompt="$"
              promptColor={theme.green}
              text='claude mcp add --transport http winreach \'
              start={16}
              cps={2.6}
              render={psHighlight}
            />
            <CmdLine
              prompt=" "
              promptColor="transparent"
              text='  https://win-build-01.trycloudflare.com/mcp \'
              start={40}
              cps={2.6}
              render={(t) => <span style={{ color: theme.cyan }}>{t}</span>}
            />
            <CmdLine
              prompt=" "
              promptColor="transparent"
              text='  --header "Authorization: Bearer wr_live_a91f…"'
              start={62}
              cps={2.6}
              render={psHighlight}
            />
            <OutLine at={92} color={theme.inkMute}>
              Connecting over Streamable HTTP…
            </OutLine>
            <OutLine at={112} color={theme.green} bold>
              ✓ Connected · 8 tools available
            </OutLine>
          </TermBody>
        </WindowChrome>
      </div>

      <HandshakeBar />
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 3 — Run PowerShell remotely
// ═════════════════════════════════════════════════════════════════════════

export const ScenePowerShell: React.FC = () => {
  const frame = useCurrentFrame();
  const term = useEnter(14, 20);
  return (
    <AbsoluteFill style={{ ...center, padding: "56px 80px" }}>
      <SceneHeader kicker="02 · Run">Run real PowerShell, remotely.</SceneHeader>

      <div style={{ marginBottom: sp(2.5), display: "flex", gap: sp(1.5) }}>
        <ToolCall tool="powershell_execute" delay={20} status={frame > 96 ? "ok" : "run"} />
      </div>

      <div
        style={{
          opacity: term.opacity,
          transform: `translateY(${term.translateY}px) scale(${term.scale})`,
        }}
      >
        <WindowChrome title="Windows PowerShell — win-build-01" width={1000}>
          <TermBody minHeight={244}>
            <CmdLine
              text="Get-CimInstance Win32_OperatingSystem | Select Caption, CsName"
              start={30}
              cps={2.1}
              caretIdle
              render={psHighlight}
            />
            <div style={{ height: sp(1.5) }} />
            <OutLine at={96} color={theme.inkFaint}>
              Caption                                CsName
            </OutLine>
            <OutLine at={102} color={theme.inkFaint}>
              -------                                ------
            </OutLine>
            <OutLine at={110} color={theme.inkSoft}>
              Microsoft Windows 11 Pro               WIN-BUILD-01
            </OutLine>
            <div style={{ height: sp(1.5) }} />
            <OutLine at={130} color={theme.inkMute}>
              exitCode 0 · 143 ms
            </OutLine>
          </TermBody>
        </WindowChrome>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 4 — Computer use (the standout)
// ═════════════════════════════════════════════════════════════════════════

// Cursor keyframes in desktop-local coordinates.
const CUR = {
  start: { x: 880, y: 90, f: 30 },
  overText: { x: 250, y: 250, f: 62 }, // arrives over the editor
  click: 66,
  typeStart: 82,
};

const ActionChip: React.FC<{ label: string; delay: number; active: boolean }> = ({
  label,
  delay,
  active,
}) => {
  const e = useEnter(delay, 8);
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateX(${(1 - e.progress) * 14}px)`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        borderRadius: 10,
        background: active ? theme.amberSoft : theme.surface,
        border: `1px solid ${active ? "rgba(250,204,21,0.45)" : theme.line}`,
        fontFamily: theme.fontMono,
        fontSize: 15,
        color: active ? theme.ink : theme.inkMute,
        transition: "none",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 7,
          background: active ? theme.amber : theme.inkFaint,
          boxShadow: active ? `0 0 10px ${theme.amberGlow}` : "none",
        }}
      />
      {label}
    </div>
  );
};

export const SceneComputerUse: React.FC = () => {
  const frame = useCurrentFrame();
  const desk = useEnter(6, 24);

  // Cursor position (eased between keyframes).
  const t = ease(frame, [CUR.start.f, CUR.overText.f], [0, 1], EASE_OUT);
  const curX = interpolate(t, [0, 1], [CUR.start.x, CUR.overText.x]);
  const curY = interpolate(t, [0, 1], [CUR.start.y, CUR.overText.y]);
  const pressed = frame >= CUR.click && frame < CUR.click + 8;
  const ripple = interpolate(frame, [CUR.click, CUR.click + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const typed = useTyped("Hi — your agent is typing this, on Windows.", CUR.typeStart, 1.4);
  const editorCaret = useCaret(18);
  const cursorVisible = fadeIn(frame, 26, 34);

  return (
    <AbsoluteFill style={{ ...center, padding: "44px 70px" }}>
      <SceneHeader kicker="03 · Computer use">
        And drive the desktop like a human.
      </SceneHeader>

      <div style={{ display: "flex", gap: sp(3), alignItems: "stretch" }}>
        {/* The mock Windows desktop */}
        <div
          style={{
            opacity: desk.opacity,
            transform: `translateY(${desk.translateY}px) scale(${desk.scale})`,
          }}
        >
          <WindowChrome title="take_screenshot · WIN-BUILD-01 · 1920×1080" width={860}>
            <div
              style={{
                position: "relative",
                height: 430,
                overflow: "hidden",
                textAlign: "left",
                background:
                  "radial-gradient(120% 100% at 20% 0%, #14213a 0%, #0c1120 55%, #070a12 100%)",
              }}
            >
              {/* editor window */}
              <div
                style={{
                  position: "absolute",
                  left: 150,
                  top: 74,
                  width: 520,
                  borderRadius: 12,
                  overflow: "hidden",
                  background: "rgba(10,11,16,0.98)",
                  border: `1px solid ${theme.lineStrong}`,
                  boxShadow: "0 30px 70px rgba(0,0,0,0.55)",
                }}
              >
                <div
                  style={{
                    height: 40,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 14px",
                    background: "rgba(255,255,255,0.045)",
                    borderBottom: `1px solid ${theme.line}`,
                  }}
                >
                  <span style={{ width: 11, height: 11, borderRadius: 11, background: "#ff5f57" }} />
                  <span style={{ width: 11, height: 11, borderRadius: 11, background: "#febc2e" }} />
                  <span style={{ width: 11, height: 11, borderRadius: 11, background: "#28c840" }} />
                  <span
                    style={{
                      marginLeft: 10,
                      fontFamily: theme.fontMono,
                      fontSize: 13,
                      color: theme.inkMute,
                    }}
                  >
                    agent-notes.txt — Notepad
                  </span>
                </div>
                <div
                  style={{
                    padding: "22px 20px",
                    minHeight: 190,
                    fontFamily: theme.fontMono,
                    fontSize: 19,
                    lineHeight: 1.6,
                    color: theme.ink,
                  }}
                >
                  {typed}
                  {frame >= CUR.typeStart && editorCaret && (
                    <span style={{ color: theme.amber }}>▋</span>
                  )}
                </div>
              </div>

              {/* taskbar */}
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 46,
                  background: "rgba(10,12,20,0.72)",
                  backdropFilter: "blur(8px)",
                  borderTop: `1px solid ${theme.line}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                {[theme.cyan, theme.inkSoft, theme.inkSoft, theme.amber].map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: i === 0 ? c : theme.surfaceUp,
                      border: `1px solid ${theme.line}`,
                    }}
                  />
                ))}
                <span
                  style={{
                    position: "absolute",
                    right: 16,
                    fontFamily: theme.fontMono,
                    fontSize: 13,
                    color: theme.inkMute,
                  }}
                >
                  9:41
                </span>
              </div>

              {/* click ripple + cursor live in desktop coordinate space */}
              <ClickRipple x={CUR.overText.x} y={CUR.overText.y} p={ripple} />
              <Cursor x={curX} y={curY} opacity={cursorVisible} pressed={pressed} />
            </div>
          </WindowChrome>
        </div>

        {/* live action log */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: sp(1.5),
            width: 230,
          }}
        >
          <div
            style={{
              fontFamily: theme.fontMono,
              fontSize: 13,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: theme.inkFaint,
              marginBottom: sp(0.5),
            }}
          >
            computer_use
          </div>
          <ActionChip label="move → 250,250" delay={CUR.start.f + 4} active={frame >= CUR.start.f + 4} />
          <ActionChip label="click left" delay={CUR.click} active={frame >= CUR.click} />
          <ActionChip label='type "Hi…"' delay={CUR.typeStart} active={frame >= CUR.typeStart} />
          <ActionChip label="Win32 SendInput" delay={CUR.typeStart + 30} active={frame >= CUR.typeStart + 30} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 5 — Security
// ═════════════════════════════════════════════════════════════════════════

const IconKey = (
  <>
    <circle cx="8" cy="8" r="4" />
    <path d="M11 11 L20 20 M17 17 l2 2 M15 19 l2 2" />
  </>
);
const IconShield = (
  <>
    <path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z" />
    <path d="M9 12 l2 2 l4 -4" />
  </>
);
const IconPolicy = (
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M8 9 h8 M8 13 h8 M8 17 h5" />
  </>
);
const IconAudit = (
  <>
    <path d="M12 3 a9 9 0 1 0 0.01 0" />
    <path d="M12 7 v5 l3 2" />
  </>
);

const SecCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  sub: string;
  delay: number;
}> = ({ icon, title, sub, delay }) => {
  const s = useSpringAt(delay);
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const y = interpolate(s, [0, 1], [26, 0]);
  const scale = interpolate(s, [0, 1], [0.94, 1]);
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        width: 268,
        padding: sp(3),
        borderRadius: 16,
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: theme.amberSoft,
          border: `1px solid rgba(250,204,21,0.35)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: sp(2),
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme.amber}
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.ink }}>{title}</div>
      <div style={{ fontSize: 16, color: theme.inkMute, marginTop: sp(1), lineHeight: 1.4 }}>
        {sub}
      </div>
    </div>
  );
};

export const SceneSecurity: React.FC = () => {
  return (
    <AbsoluteFill style={{ ...center, padding: "56px 80px" }}>
      <SceneHeader kicker="04 · Secured by default">
        Every agent, locked to its own key.
      </SceneHeader>
      <div style={{ display: "flex", gap: sp(2.5), flexWrap: "wrap", justifyContent: "center" }}>
        <SecCard icon={IconKey} title="Per-user keys" sub="A distinct bearer token per agent — hashed at rest." delay={14} />
        <SecCard icon={IconShield} title="Roles" sub="admin · operator · readonly scope every principal." delay={22} />
        <SecCard icon={IconPolicy} title="Command policy" sub="Regex allow / deny lists gate every command." delay={30} />
        <SecCard icon={IconAudit} title="Audit log" sub="Append-only JSONL record of every tool call." delay={38} />
      </div>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════════════════════════════════════════
// Scene 6 — End card
// ═════════════════════════════════════════════════════════════════════════

export const SceneEnd: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = useEnter(6, 20);
  const tag = useEnter(24, 16);
  const cmd = useEnter(40, 14);
  const repo = fadeIn(frame, 56, 74);

  return (
    <AbsoluteFill style={{ ...center, padding: sp(10) }}>
      <div
        style={{
          opacity: mark.opacity,
          transform: `translateY(${mark.translateY}px) scale(${mark.scale})`,
          fontSize: 88,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        Win<span style={{ color: theme.amber }}>Reach</span>
      </div>

      <p
        style={{
          opacity: tag.opacity,
          transform: `translateY(${tag.translateY}px)`,
          fontSize: 30,
          color: theme.inkSoft,
          margin: `${sp(3)}px 0 0`,
          maxWidth: 820,
          lineHeight: 1.4,
        }}
      >
        Give your AI agent its own Windows machine.
      </p>

      <div
        style={{
          opacity: cmd.opacity,
          transform: `translateY(${cmd.translateY}px) scale(${cmd.scale})`,
          marginTop: sp(5),
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 26px",
          borderRadius: 12,
          background: theme.surface,
          border: `1px solid rgba(250,204,21,0.4)`,
          fontFamily: theme.fontMono,
          fontSize: 26,
        }}
      >
        <span style={{ color: theme.amber }}>$</span>
        <span style={{ color: theme.ink }}>npx winreach-mcp</span>
      </div>

      <div
        style={{
          opacity: repo,
          marginTop: sp(4),
          fontFamily: theme.fontMono,
          fontSize: 20,
          color: theme.inkMute,
        }}
      >
        github.com/GhouI/winreach-mcp
      </div>
    </AbsoluteFill>
  );
};
