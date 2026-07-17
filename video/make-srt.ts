// Emit assets/winreach-linkedin.srt from the shared caption cue track, so the
// open captions burned into the video and the sidecar .srt never drift.
// Run: npx tsx video/make-srt.ts
import { writeFileSync } from "node:fs";
import { LINKEDIN_CUES, LINKEDIN_FPS } from "./linkedin-captions";

function ts(frame: number): string {
  const totalMs = Math.round((frame / LINKEDIN_FPS) * 1000);
  const ms = totalMs % 1000;
  const totalS = Math.floor(totalMs / 1000);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

const srt = LINKEDIN_CUES.map((c, i) => {
  return `${i + 1}\n${ts(c.from)} --> ${ts(c.to)}\n${c.lines.join("\n")}\n`;
}).join("\n");

writeFileSync("assets/winreach-linkedin.srt", srt, "utf8");
console.log(`Wrote assets/winreach-linkedin.srt (${LINKEDIN_CUES.length} cues)`);
