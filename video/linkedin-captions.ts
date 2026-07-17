// Burned-in (open) caption track for the LinkedIn cut.
// LinkedIn autoplays muted, so these narrate the whole video. Each cue is
// 1–2 lines, ≤ ~42 chars/line. Timings are in frames @ 30fps and are the
// single source of truth for both the on-screen captions and the .srt file.

export const LINKEDIN_FPS = 30;
export const LINKEDIN_FRAMES = 1650; // 55s

export type Cue = { from: number; to: number; lines: string[] };

export const LINKEDIN_CUES: Cue[] = [
  // 0–3s · hook (money shot, silent)
  { from: 0, to: 90, lines: ["An AI agent is controlling this PC —", "from another machine."] },

  // 3–15s · one command + tunnel
  { from: 90, to: 210, lines: ["One command turns a Windows box", "into an MCP server:  npx winreach-mcp"] },
  { from: 210, to: 330, lines: ["It opens a secure Cloudflare tunnel —", "no inbound firewall holes."] },
  { from: 330, to: 450, lines: ["Any MCP agent connects over HTTP", "with its own bearer key."] },

  // 15–35s · capability montage
  { from: 450, to: 600, lines: ["Run real PowerShell, remotely —", "as a single MCP tool call."] },
  { from: 600, to: 750, lines: ["Move files both ways —", "sandboxed and hash-verified."] },
  { from: 750, to: 900, lines: ["Capture the screen", "whenever the agent needs to look."] },
  { from: 900, to: 1050, lines: ["And drive the mouse and keyboard", "like a human — full computer use."] },

  // 35–50s · security
  { from: 1050, to: 1200, lines: ["Every agent gets its own key and role:", "admin · operator · readonly."] },
  { from: 1200, to: 1350, lines: ["A regex command policy blocks", "dangerous commands — live."] },
  { from: 1350, to: 1500, lines: ["And every action is written", "to an append-only audit log."] },

  // 50–55s · end card
  { from: 1500, to: 1650, lines: ["WinReach — give your AI agent", "its own Windows machine."] },
];
