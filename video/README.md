# WinReach demo video

The demo shown in the project [README](../README.md) is generated
programmatically with [Remotion](https://www.remotion.dev/) — no video editor,
just React. Everything is code in this folder, so the video is diffable,
reviewable, and re-renderable on any machine.

## Story (≈29s @ 30fps, 1920×1080)

| # | Scene | Idea |
| - | ----- | ---- |
| 1 | Hook | "Give your AI agent its own Windows machine." |
| 2 | Connect | `claude mcp add` over Streamable HTTP + a bearer key handshake |
| 3 | Run | Remote `powershell_execute` — typed command → clean output |
| 4 | Computer use | Cursor moves, clicks, and types on a mock Windows desktop |
| 5 | Security | Per-user keys · roles · command policy · audit log |
| 6 | End card | Wordmark · pitch · `npx winreach-mcp` · repo URL |

## LinkedIn cut (`WinReachLinkedIn`)

A second composition re-cuts the same brand and building blocks for social:

- **4:5 vertical, 1080×1350, 30fps, ~55s.** Recomposed for portrait — not a
  letterboxed 16:9.
- **First 3s is a silent money shot:** the cursor moves, clicks, and types on
  the Windows desktop under the hook line *"An AI agent is controlling this PC
  — from another machine."* — no logo intro.
- **Burned-in open captions** (LinkedIn autoplays muted), 1–2 lines ≤ ~42
  chars, kept clear of the bottom ~150px UI safe area. The captions come from
  `linkedin-captions.ts`, the single source of truth shared with the `.srt`.
- Beat sheet: hook → `npx winreach-mcp` + tunnel → montage (PowerShell · file
  transfer · screenshot · computer use) → security (roles · a live regex deny
  · scrolling audit log) → end card.

`WinReachLinkedInCover` is a separate 1080×1350 still for the post cover.

## Files

| File | Purpose |
| ---- | ------- |
| `index.ts` | Registers the Remotion root. |
| `root.tsx` | Registers all compositions (16:9 demo, LinkedIn cut, cover still). |
| `winreach-demo.tsx` | 16:9 timeline — sequences the scenes with crossfades via `Series`. |
| `scenes.tsx` | The six 16:9 scenes. |
| `linkedin.tsx` | The vertical LinkedIn cut (beats + burned-in captions) and the cover. |
| `linkedin-captions.ts` | Caption cue track — shared by the on-screen captions and the `.srt`. |
| `make-srt.ts` | Emits `assets/winreach-linkedin.srt` from the cue track (`npm run video:srt:linkedin`). |
| `desktop.tsx` | Reusable mock Windows desktop (wallpaper, editor, taskbar, animated cursor). |
| `terminal.tsx` | Terminal atoms (typed lines, output, tool-call chips, PS syntax). |
| `helpers.tsx` | Motion primitives, the `Scene` wrapper, cursor + window chrome. |
| `theme.ts` | Brand tokens — near-black canvas, amber accent, 8px spacing. |

## Re-render

Rendering needs the dev dependencies installed (`npm install`) and downloads a
headless Chromium on first run.

```powershell
# Preview / edit interactively in Remotion Studio
npx remotion studio video/index.ts

# Full-quality MP4  → assets/winreach-demo.mp4
npm run video:render

# Poster frame      → assets/winreach-demo.png
npm run video:still

# Looping GIF for the README (downscaled, every other frame)
npm run video:gif

# LinkedIn cut (4:5) — MP4, cover still, and .srt captions
npm run video:render:linkedin   # → assets/winreach-linkedin.mp4
npm run video:cover:linkedin    # → assets/winreach-linkedin-cover.png
npm run video:srt:linkedin      # → assets/winreach-linkedin.srt
```

The committed `winreach-linkedin.mp4` is re-encoded from the Remotion output to
a LinkedIn-recommended ~6 Mbps H.264 (yuv420p, `+faststart`). The dark, mostly
static content is very compressible, so the raw Remotion render lands far below
that bitrate; the re-encode brings it into the 5–8 Mbps range LinkedIn expects:

```bash
ffmpeg -y -i raw-linkedin.mp4 -c:v libx264 -preset slow \
  -b:v 6M -minrate 6M -maxrate 6M -bufsize 6M -x264-params "nal-hrd=cbr:filler=1" \
  -pix_fmt yuv420p -movflags +faststart -an assets/winreach-linkedin.mp4
```

`npm run video:gif` renders a GIF straight from Remotion. The size-optimized
GIF committed to `assets/` is instead produced from the MP4 with ffmpeg
two-pass palette generation (smaller, cleaner colors):

```bash
ffmpeg -y -i assets/winreach-demo.mp4 \
  -vf "fps=14,scale=840:-1:flags=lanczos,palettegen=stats_mode=diff" pal.png
ffmpeg -y -i assets/winreach-demo.mp4 -i pal.png \
  -lavfi "fps=14,scale=840:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
  assets/winreach-demo.gif
```
