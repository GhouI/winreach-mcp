import React from "react";
import {
  AbsoluteFill,
  interpolate,
  Sequence,
  useCurrentFrame,
} from "remotion";
import { sceneBg, sp, theme } from "./theme";
import {
  ease,
  fadeIn,
  Kicker,
  Scene,
  useEnter,
} from "./helpers";
import { CmdLine, OutLine, psHighlight, TermBody, ToolCall } from "./terminal";
import { MockDesktop } from "./desktop";
import { LINKEDIN_CUES, LINKEDIN_FRAMES } from "./linkedin-captions";

const W = 1080;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Content region: reserve bottom 300px for the caption band + LinkedIn UI
// safe area (captions never enter the bottom ~150px).
const stage: React.CSSProperties = {
  padding: "116px 70px 300px",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
};

// ─────────────────────────────────────────────────────────────────────────
// Burned-in captions (open captions — LinkedIn autoplays muted).
// Rendered once as a global overlay so timings match the .srt exactly.
// ─────────────────────────────────────────────────────────────────────────
const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const cue = LINKEDIN_CUES.find((c) => frame >= c.from && frame < c.to);
  if (!cue) return null;
  const o = Math.min(
    interpolate(frame, [cue.from, cue.from + 6], [0, 1], clamp),
    interpolate(frame, [cue.to - 6, cue.to], [1, 0], clamp)
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 182, // box bottom ≈ y1168 — clears the bottom 150px safe area
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          opacity: o,
          maxWidth: 900,
          background: "rgba(5,5,8,0.74)",
          border: `1px solid ${theme.line}`,
          borderRadius: 16,
          padding: "18px 30px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
        }}
      >
        {cue.lines.map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 35,
              fontWeight: 600,
              lineHeight: 1.32,
              letterSpacing: -0.3,
              color: i === 0 ? theme.ink : theme.inkSoft,
            }}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

const BeatHead: React.FC<{ kicker: string; title: React.ReactNode }> = ({
  kicker,
  title,
}) => {
  const h = useEnter(8, 16);
  return (
    <div style={{ marginBottom: sp(4.5), textAlign: "center" }}>
      <Kicker delay={2}>{kicker}</Kicker>
      <h2
        style={{
          fontSize: 46,
          fontWeight: 700,
          letterSpacing: -1,
          lineHeight: 1.1,
          margin: `${sp(2)}px 0 0`,
          opacity: h.opacity,
          transform: `translateY(${h.translateY}px)`,
        }}
      >
        {title}
      </h2>
    </div>
  );
};

const Panel: React.FC<{ children: React.ReactNode; delay?: number }> = ({
  children,
  delay = 12,
}) => {
  const e = useEnter(delay, 22);
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px) scale(${e.scale})`,
      }}
    >
      {children}
    </div>
  );
};

const TermFrame: React.FC<{
  title: string;
  accent?: boolean;
  children: React.ReactNode;
}> = ({ title, accent, children }) => (
  <div
    style={{
      width: 920,
      borderRadius: 16,
      overflow: "hidden",
      background: "rgba(6,6,9,0.92)",
      border: `1px solid ${accent ? "rgba(250,204,21,0.35)" : theme.lineStrong}`,
      boxShadow: accent
        ? "0 40px 110px rgba(0,0,0,0.6), 0 0 60px rgba(250,204,21,0.10)"
        : "0 40px 110px rgba(0,0,0,0.6)",
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
      <span style={{ width: 13, height: 13, borderRadius: 13, background: "#ff5f57" }} />
      <span style={{ width: 13, height: 13, borderRadius: 13, background: "#febc2e" }} />
      <span style={{ width: 13, height: 13, borderRadius: 13, background: "#28c840" }} />
      <span
        style={{
          marginLeft: 12,
          color: theme.inkMute,
          fontFamily: theme.fontMono,
          fontSize: 15,
        }}
      >
        {title}
      </span>
    </div>
    {children}
  </div>
);

// ═══════════════════════════════════════════════════════════════ Beat 1 · Hook
const BeatHook: React.FC = () => {
  const line = useEnter(3, 16);
  const deskE = useEnter(0, 20);
  return (
    <AbsoluteFill style={{ padding: "84px 60px 300px", alignItems: "center" }}>
      <h1
        style={{
          opacity: line.opacity,
          transform: `translateY(${line.translateY}px)`,
          fontSize: 48,
          fontWeight: 700,
          letterSpacing: -1,
          lineHeight: 1.14,
          textAlign: "center",
          margin: 0,
          maxWidth: 940,
        }}
      >
        An AI agent is controlling this PC —{" "}
        <span style={{ color: theme.amber }}>from another machine.</span>
      </h1>
      <div
        style={{
          marginTop: sp(5),
          width: 960,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${theme.lineStrong}`,
          boxShadow: "0 44px 120px rgba(0,0,0,0.6)",
          opacity: deskE.opacity,
          transform: `scale(${interpolate(deskE.progress, [0, 1], [0.98, 1])})`,
        }}
      >
        <MockDesktop
          width={960}
          height={560}
          text="Typed live by an AI agent, 3,000 miles away."
          typeStart={40}
          cps={2.4}
          moveStart={6}
          moveEnd={30}
          clickAt={34}
          editorTitle="agent-notes.txt — Notepad"
        />
      </div>
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════ Beat 2 · Setup
const BeatSetup: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = ease(frame, [128, 150], [0, 1]);
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Publish" title={<>One command. Public in seconds.</>} />
      <Panel delay={12}>
        <TermFrame title="Windows PowerShell — win-build-01" accent>
          <TermBody fontSize={19} minHeight={392} style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                left: 22,
                right: 22,
                top: 118,
                height: 34,
                borderRadius: 8,
                background: `${theme.green}1f`,
                opacity: glow,
                filter: "blur(2px)",
              }}
            />
            <div style={{ position: "relative" }}>
              <CmdLine
                prompt="$"
                promptColor={theme.green}
                text="npx winreach-mcp"
                start={8}
                caretIdle
                render={psHighlight}
              />
              <OutLine at={60} color={theme.inkMute}>
                WinReach MCP listening at http://127.0.0.1:7573/mcp
              </OutLine>
              <OutLine at={96} color={theme.inkMute}>
                Cloudflare tunnel ready:
              </OutLine>
              <OutLine at={120} color={theme.green} bold>
                {"  https://win-build-01.trycloudflare.com/mcp"}
              </OutLine>
              <div style={{ height: sp(2) }} />
              <CmdLine
                prompt="$"
                promptColor={theme.green}
                text={"claude mcp add --transport http winreach \\"}
                start={210}
                cps={2.6}
                render={psHighlight}
              />
              <CmdLine
                prompt=" "
                promptColor="transparent"
                text={"  --header \"Authorization: Bearer wr_live_a91f…\""}
                start={250}
                cps={2.6}
                render={psHighlight}
              />
              <OutLine at={318} color={theme.green} bold>
                ✓ Connected · 8 tools available
              </OutLine>
            </div>
          </TermBody>
        </TermFrame>
      </Panel>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 3a · PowerShell
const BeatPowerShell: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Run" title="Remote PowerShell." />
      <div style={{ marginBottom: sp(3) }}>
        <ToolCall tool="powershell_execute" delay={8} status={frame > 74 ? "ok" : "run"} />
      </div>
      <Panel delay={12}>
        <TermFrame title="Windows PowerShell — win-build-01">
          <TermBody fontSize={19} minHeight={300}>
            <CmdLine
              text="Get-Process | Sort CPU -desc | Select -First 3 Name, CPU"
              start={14}
              cps={2.1}
              caretIdle
              render={psHighlight}
            />
            <div style={{ height: sp(1.5) }} />
            <OutLine at={78} color={theme.inkFaint}>
              Name              CPU
            </OutLine>
            <OutLine at={84} color={theme.inkFaint}>
              ----              ---
            </OutLine>
            <OutLine at={92} color={theme.inkSoft}>
              chrome         214.7
            </OutLine>
            <OutLine at={100} color={theme.inkSoft}>
              node            88.1
            </OutLine>
            <OutLine at={108} color={theme.inkSoft}>
              pwsh            12.4
            </OutLine>
            <div style={{ height: sp(1.5) }} />
            <OutLine at={124} color={theme.inkMute}>
              exitCode 0 · 121 ms
            </OutLine>
          </TermBody>
        </TermFrame>
      </Panel>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 3b · File
const ProgressBar: React.FC<{ start: number; dur: number }> = ({ start, dur }) => {
  const frame = useCurrentFrame();
  if (frame < start) return null;
  const p = ease(frame, [start, start + dur], [0, 1]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, margin: `${sp(2)}px 0` }}>
      <div
        style={{
          flex: 1,
          height: 12,
          borderRadius: 12,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${p * 100}%`,
            height: "100%",
            background: theme.amber,
            borderRadius: 12,
            boxShadow: `0 0 16px ${theme.amberGlow}`,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: theme.fontMono,
          fontSize: 17,
          color: theme.inkMute,
          width: 54,
          textAlign: "right",
        }}
      >
        {Math.round(p * 100)}%
      </span>
    </div>
  );
};

const BeatFile: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Transfer" title="Move files both ways." />
      <div style={{ marginBottom: sp(3) }}>
        <ToolCall tool="file_upload" delay={8} status={frame > 116 ? "ok" : "run"} />
      </div>
      <Panel delay={12}>
        <TermFrame title="winreach · file transfer">
          <TermBody fontSize={19} minHeight={220}>
            <CmdLine
              text={"file_upload  report.pdf  →  C:\\winreach-files\\"}
              start={14}
              cps={2.2}
              render={psHighlight}
            />
            <ProgressBar start={58} dur={52} />
            <OutLine at={116} color={theme.green} bold>
              ✓ uploaded 2.4 MB · sha256 9f3c1a7e…
            </OutLine>
            <OutLine at={132} color={theme.inkMute}>
              sandboxed to WINREACH_FILE_ROOT · integrity verified
            </OutLine>
          </TermBody>
        </TermFrame>
      </Panel>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 3c · Screenshot
const BeatScreenshot: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = useEnter(40, 26);
  const flash = interpolate(frame, [38, 46], [0.5, 0], clamp);
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="See" title="Capture the screen." />
      <div style={{ marginBottom: sp(3) }}>
        <ToolCall tool="take_screenshot" delay={8} status={frame > 46 ? "ok" : "run"} />
      </div>
      <div
        style={{
          opacity: shot.opacity,
          transform: `translateY(${shot.translateY}px) scale(${shot.scale})`,
          width: 640,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${theme.lineStrong}`,
          boxShadow: "0 34px 90px rgba(0,0,0,0.6)",
          position: "relative",
        }}
      >
        <MockDesktop
          width={640}
          height={384}
          text="captured by the agent."
          typeStart={-100}
          moveStart={-100}
          moveEnd={-80}
          clickAt={-100}
          cursorAppear={-100}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#fff",
            opacity: frame > 46 ? 0 : flash,
            pointerEvents: "none",
          }}
        />
      </div>
      <div
        style={{
          marginTop: sp(2.5),
          fontFamily: theme.fontMono,
          fontSize: 18,
          color: theme.inkMute,
          opacity: fadeIn(frame, 56, 68),
        }}
      >
        1920×1080 · png · 82 KB · 96 ms
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 3d · Computer use
const BeatComputerUse: React.FC = () => {
  const deskE = useEnter(4, 22);
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Control" title="Drive the desktop." />
      <div
        style={{
          opacity: deskE.opacity,
          transform: `translateY(${deskE.translateY}px) scale(${deskE.scale})`,
          width: 900,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${theme.lineStrong}`,
          boxShadow: "0 40px 110px rgba(0,0,0,0.6)",
        }}
      >
        <MockDesktop
          width={900}
          height={500}
          text="Clicked and typed by the agent — via computer_use."
          typeStart={64}
          cps={1.9}
          moveStart={14}
          moveEnd={44}
          clickAt={48}
          actions={[
            { label: "move → click", at: 16 },
            { label: "click left", at: 48 },
            { label: 'type "…"', at: 64 },
          ]}
        />
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 4a · Roles
const RoleRow: React.FC<{
  who: string;
  role: string;
  scope: string;
  delay: number;
}> = ({ who, role, scope, delay }) => {
  const e = useEnter(delay, 18);
  return (
    <div
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.translateY}px)`,
        display: "grid",
        gridTemplateColumns: "180px 170px 1fr",
        alignItems: "center",
        gap: sp(2),
        padding: "18px 24px",
        borderRadius: 12,
        background: theme.surface,
        border: `1px solid ${theme.line}`,
        textAlign: "left",
      }}
    >
      <span style={{ fontFamily: theme.fontMono, fontSize: 22, color: theme.ink }}>{who}</span>
      <span
        style={{
          justifySelf: "start",
          padding: "5px 14px",
          borderRadius: 999,
          background: theme.amberSoft,
          border: `1px solid rgba(250,204,21,0.4)`,
          color: theme.amber,
          fontFamily: theme.fontMono,
          fontSize: 18,
          fontWeight: 600,
        }}
      >
        {role}
      </span>
      <span style={{ fontFamily: theme.fontMono, fontSize: 19, color: theme.inkMute }}>{scope}</span>
    </div>
  );
};

const BeatRoles: React.FC = () => (
  <AbsoluteFill style={stage}>
    <BeatHead kicker="RBAC" title="Its own key. Its own role." />
    <div style={{ display: "flex", flexDirection: "column", gap: sp(1.5), width: 820 }}>
      <RoleRow who="ci" role="admin" scope="all tools" delay={12} />
      <RoleRow who="agent" role="readonly" scope="^Get- · ^Test-" delay={22} />
      <RoleRow who="ops" role="operator" scope="powershell · computer_use" delay={32} />
    </div>
  </AbsoluteFill>
);

// ═══════════════════════════════════════════════════════ Beat 4b · Deny policy
const BeatDeny: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(frame, [68, 78, 92], [0, 1, 0.55], clamp);
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Policy" title="Dangerous commands, blocked." />
      <Panel delay={12}>
        <TermFrame title="Windows PowerShell — win-build-01">
          <TermBody fontSize={19} minHeight={230} style={{ position: "relative" }}>
            <CmdLine
              text={"Remove-Item -Recurse -Force C:\\Windows\\System32"}
              start={14}
              cps={2.0}
              caretIdle
              render={psHighlight}
            />
            <div style={{ height: sp(1.5) }} />
            <div
              style={{
                position: "relative",
                borderLeft: `3px solid ${theme.rose}`,
                paddingLeft: 16,
                marginLeft: -19,
                background: `rgba(251,113,133,${0.12 * pulse})`,
                borderRadius: 4,
              }}
            >
              <OutLine at={64} color={theme.rose} bold>
                ✗ blocked by command policy
              </OutLine>
              <OutLine at={84} color={theme.inkMute}>
                {"deny: /Remove-Item\\s+-Recurse/"}
              </OutLine>
            </div>
            <div style={{ height: sp(1.5) }} />
            <OutLine at={106} color={theme.inkFaint}>
              logged · principal "agent" · role readonly
            </OutLine>
          </TermBody>
        </TermFrame>
      </Panel>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════ Beat 4c · Audit log
const AUDIT: string[] = [
  '{"ts":"12:04:59Z","principal":"ci","tool":"powershell_execute","ok":true}',
  '{"ts":"12:05:03Z","principal":"agent","tool":"take_screenshot","ok":true}',
  '{"ts":"12:05:07Z","principal":"agent","tool":"file_upload","bytes":2411724}',
  '{"ts":"12:05:11Z","principal":"ops","tool":"computer_use","action":"click"}',
  '{"ts":"12:05:12Z","principal":"ops","tool":"computer_use","action":"type"}',
  '{"ts":"12:05:18Z","principal":"agent","tool":"powershell_execute","ok":true}',
  '{"ts":"12:05:24Z","principal":"agent","tool":"powershell_execute","blocked":true}',
  '{"ts":"12:05:29Z","principal":"ci","tool":"file_download","ok":true}',
];

const BeatAudit: React.FC = () => {
  const frame = useCurrentFrame();
  const lineH = 40;
  const scroll = ease(frame, [24, 150], [0, lineH * 4]);
  return (
    <AbsoluteFill style={stage}>
      <BeatHead kicker="Audit" title="Every action, on the record." />
      <Panel delay={12}>
        <TermFrame title="winreach-audit.jsonl">
          <div style={{ height: 300, overflow: "hidden", position: "relative" }}>
            <div
              style={{
                padding: "20px 28px",
                fontFamily: theme.fontMono,
                fontSize: 16,
                lineHeight: `${lineH}px`,
                transform: `translateY(${-scroll}px)`,
                textAlign: "left",
              }}
            >
              {AUDIT.map((l, i) => {
                const blocked = l.includes("blocked");
                return (
                  <div
                    key={i}
                    style={{
                      color: blocked ? theme.rose : theme.inkSoft,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: theme.inkFaint }}>{String(i + 1).padStart(2, "0")} </span>
                    {l}
                  </div>
                );
              })}
            </div>
            {/* top/bottom fade masks for the scroll */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 40,
                background: "linear-gradient(rgba(6,6,9,0.95), rgba(6,6,9,0))",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: 40,
                background: "linear-gradient(rgba(6,6,9,0), rgba(6,6,9,0.95))",
              }}
            />
          </div>
        </TermFrame>
      </Panel>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════════ Beat 5 · End
const BeatEnd: React.FC = () => {
  const frame = useCurrentFrame();
  const mark = useEnter(6, 20);
  const meta = fadeIn(frame, 34, 52);
  const cmd = useEnter(24, 14);
  return (
    <AbsoluteFill style={stage}>
      <div
        style={{
          opacity: mark.opacity,
          transform: `translateY(${mark.translateY}px) scale(${mark.scale})`,
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -2,
        }}
      >
        Win<span style={{ color: theme.amber }}>Reach</span>
      </div>
      <div
        style={{
          opacity: cmd.opacity,
          transform: `translateY(${cmd.translateY}px) scale(${cmd.scale})`,
          marginTop: sp(4),
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 28px",
          borderRadius: 12,
          background: theme.surface,
          border: `1px solid rgba(250,204,21,0.4)`,
          fontFamily: theme.fontMono,
          fontSize: 28,
        }}
      >
        <span style={{ color: theme.amber }}>$</span>
        <span style={{ color: theme.ink }}>npx winreach-mcp</span>
      </div>
      <div
        style={{
          opacity: meta,
          marginTop: sp(4),
          fontFamily: theme.fontMono,
          fontSize: 24,
          color: theme.inkMute,
          letterSpacing: 0.4,
        }}
      >
        MIT · github.com/GhouI/winreach-mcp
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────────────────
type Beat = { comp: React.FC; from: number; dur: number; exit?: number };
const BEATS: Beat[] = [
  { comp: BeatHook, from: 0, dur: 90 },
  { comp: BeatSetup, from: 90, dur: 360 },
  { comp: BeatPowerShell, from: 450, dur: 150 },
  { comp: BeatFile, from: 600, dur: 150 },
  { comp: BeatScreenshot, from: 750, dur: 150 },
  { comp: BeatComputerUse, from: 900, dur: 150 },
  { comp: BeatRoles, from: 1050, dur: 150 },
  { comp: BeatDeny, from: 1200, dur: 150 },
  { comp: BeatAudit, from: 1350, dur: 150 },
  { comp: BeatEnd, from: 1500, dur: 150, exit: 20 },
];

export const LINKEDIN_TOTAL = LINKEDIN_FRAMES;

export const WinReachLinkedIn: React.FC = () => {
  return (
    <AbsoluteFill style={sceneBg}>
      {BEATS.map((b, i) => {
        const C = b.comp;
        return (
          <Sequence key={i} from={b.from} durationInFrames={b.dur} layout="none">
            <Scene length={b.dur} enter={10} exit={b.exit ?? 10}>
              <C />
            </Scene>
          </Sequence>
        );
      })}
      <Captions />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Cover frame (static) — Windows desktop, cursor mid-action, hero line.
// ─────────────────────────────────────────────────────────────────────────
export const WinReachLinkedInCover: React.FC = () => {
  return (
    <AbsoluteFill style={{ ...sceneBg, padding: "96px 60px", alignItems: "center" }}>
      <div style={{ textAlign: "center", marginBottom: sp(5) }}>
        <div
          style={{
            fontFamily: theme.fontMono,
            fontSize: 22,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: theme.amber,
            marginBottom: sp(2),
          }}
        >
          WinReach
        </div>
        <h1
          style={{
            fontSize: 58,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            margin: 0,
            maxWidth: 940,
          }}
        >
          Give your AI agent its own{" "}
          <span style={{ color: theme.amber }}>Windows machine.</span>
        </h1>
      </div>
      <div
        style={{
          width: 940,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${theme.lineStrong}`,
          boxShadow: "0 50px 130px rgba(0,0,0,0.65)",
        }}
      >
        <MockDesktop
          width={940}
          height={620}
          text="Controlled by an AI agent, over HTTP."
          typeStart={-100}
          moveStart={-100}
          moveEnd={-80}
          clickAt={-200}
          cursorAppear={-100}
        />
      </div>
    </AbsoluteFill>
  );
};
