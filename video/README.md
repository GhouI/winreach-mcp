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

## Files

| File | Purpose |
| ---- | ------- |
| `index.ts` | Registers the Remotion root. |
| `root.tsx` | Registers the `WinReachDemo` composition (size, fps, duration). |
| `winreach-demo.tsx` | Timeline — sequences the scenes with crossfades via `Series`. |
| `scenes.tsx` | The six scenes. |
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
