# PRD: `screen_record` — short desktop video capture for agents

**Status:** Draft (planning) · **Owner:** GhouI · **Created:** 2026-07-18

## One-liner
An optional, opt-in add-on that lets an AI agent record a short (≤5–10s) video of the Windows desktop and receive it back, so the agent can analyze **motion/change over time** (an install bar filling, an animation, a process finishing) that a single `take_screenshot` can't show.

## Problem / motivation
`take_screenshot` gives the agent one static frame. But when the agent drives the desktop with `computer_use`, a lot of what matters is *change over time* — did the dialog appear, did the progress bar move, did the app finish loading. A short recording the agent can step through frame-by-frame closes that gap and makes `computer_use` far more reliable.

## Goals
- A `screen_record` MCP tool: agent picks a **duration (hard cap 5–10s)** and an **fps**; server records the desktop and returns a **video artifact** (base64) plus a **note** telling the agent how to analyze it with its own tools (e.g. `ffmpeg -i recording.mp4 -vf fps=2 frame_%03d.png`, then read the frames).
- **Quality-first**: the agent must be able to *read* on-screen text/UI. Optimize for the smallest file that stays clearly legible — never smallest-at-any-cost.
- Keep it **out of core**: ships as a **separate, opt-in add-on** so core WinReach stays lean and native-dependency-free.
- Same safety posture as `computer_use`/`take_screenshot`: **off by default, role-gated, audited, capped.**

## Non-goals
- Not a real-time / live stream. It's a bounded clip the agent requests, waits for, and analyzes.
- Not audio.
- WinReach does **not** ship ffmpeg for the agent — decoding/analysis is on the agent side.
- Not in the default install / core dependency tree.

## Encoding decision (quality-first)
Screen content = sharp edges + text + flat color (not photographic), so over-compression destroys legibility. Options evaluated:

| Approach | Quality on text/UI | Size | Native deps? | Notes |
|---|---|---|---|---|
| **H.264 via WASM encoder** (`h264-mp4-encoder`) | **Excellent at low CRF (~16–18)** | **Small** | **No** — WASM only (install confirmed clean, 1 pkg, no native binary) | Best quality/size; lives in the add-on |
| **MJPEG + our own tiny muxer** (.NET JPEG q92 + pure-JS AVI/MOV muxer) | Crisp at q90–95 | Medium/large | **None** (100% our code) | Zero-dep; light enough it could even sit in core |
| GIF (.NET) | Sharp edges but 256-color quantized | Large | None | Lossy color; fine for simple UI, poor for gradients |
| mediabunny `@mediabunny/server` | Excellent | Small | **Yes** — NodeAV = native FFmpeg bindings | Heaviest; native install risk on Windows |

**Recommendation:** ship the add-on with **H.264 via the WASM encoder at a legibility-safe quality (≈ CRF 16–18)** — sharp text, efficient size, no native deps. Keep **high-quality MJPEG (q92) with our own muxer** as the zero-dependency fallback. GIF/mediabunny documented as the lighter-lossy / heavier-native ends.

**Open item:** confirm with a quick encode test (encode a text-heavy clip at CRF 14/18/23 and JPEG q95/90/80, eyeball legibility + record sizes) before locking the default. Report a rough weight for a 5s and 10s clip at the chosen setting.

## Architecture: opt-in add-on, downloaded (not npm)
- The recording module lives in a **separate GitHub repo** (e.g. `winreach-screen-record`), not the core npm package.
- **Onboarding toggle:** if the operator enables "screen recording", WinReach **downloads the add-on from its repo release** (pinned version + **SHA-256 checksum verification**) into a local plugins dir and loads it at startup. No silent remote code pull — only on explicit opt-in behind the **setup key**.
- Core WinReach exposes a **minimal plugin loader**: at startup, load any enabled add-on module and let it register its MCP tool(s) through the existing `src/tools/` context.
- The add-on's release ships whatever it needs (the WASM encoder + PS capture script; if we ever go native, a prebuilt Windows-x64 bundle) — the weight stays in the add-on, never core.

## Security / gating
- **Off by default.** New env, e.g. `WINREACH_ALLOW_SCREEN_RECORD` (+ `WINREACH_SCREEN_RECORD_ROLES`), mirroring the screenshot gate. Only registered when enabled, the role is permitted, and the principal's `tools` allowlist allows it.
- **Caps:** max duration (≤10s), max fps, max resolution (downscale), and a **max output-size** guard so a clip can't blow up the response.
- **Audited** per recording (principal, role, duration, fps, bytes, outcome), like `take_screenshot`.
- Interactive-desktop only (session 0 fails gracefully, same as screenshot/computer-use).
- Downloaded add-on code is pinned + checksummed; document the supply-chain trust boundary.

## Task breakdown
1. **Core: minimal plugin loader** — discover + load an enabled add-on module, expose the tools context to it. Tests for load/no-load/disabled.
2. **Core: onboarding toggle + download-on-opt-in** — setup-web toggle → `/api/apply` fetches the pinned add-on release, verifies checksum, installs to the plugins dir. Setup-key gated.
3. **Add-on repo scaffold** — `winreach-screen-record`: the `screen_record` tool + PowerShell/.NET frame-capture loop + the chosen encoder (WASM H.264, with MJPEG fallback).
4. **Encoder confirmation test** — the quick legibility/size test above; lock the default quality setting.
5. **Gating + audit + caps** in the add-on's tool registration.
6. **Docs** — SECURITY.md row, README/CONNECT note, and the add-on repo README (how it's downloaded, the trust model, how the agent decodes the video).

## Acceptance criteria
- With the add-on disabled, `screen_record` is **not** offered and core has **zero** new native deps.
- With it enabled for a permitted role, `screen_record` records N seconds at the requested fps, returns a **valid video** (ffmpeg decodes it; frames extractable) plus the analysis note, **under the size cap**.
- On-screen **text is legible** in the returned frames at the chosen quality setting (manual check on a text-heavy clip).
- Every recording is audited; disabled/over-cap/over-role requests are refused and audited.
- The add-on download verifies the pinned checksum and refuses on mismatch.

## Open questions
1. Encoder default — lock **H.264 CRF ~16–18 (WASM)**, or prefer the zero-dep **MJPEG q92** even at larger size? (Decide after the confirmation test.)
2. Return only the video, or **also** save it to a server-owned dir for operator review (like screenshots)?
3. Plugin loader scope — build it generically (future add-ons plug in the same way) or keep it specific to this one module for now?
4. Repo name for the add-on (`winreach-screen-record`?).
