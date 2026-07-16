# WinBridge Setup Web

A small [Next.js](https://nextjs.org) app that helps you configure a
[WinBridge MCP](../README.md) server. Walk through the setup stages
(Server → Access → Security → Tools → Policy → Review) and it generates, live
in your browser:

- the `WINBRIDGE_*` **environment variables** and a **`start.ps1`** script,
- a **Windows firewall rule** (`New-NetFirewallRule`) scoped to your allowed
  source IPs / corporate CIDRs,
- **agent-connect snippets** for Claude Code and Codex.

It toggles the opt-in tools (`take_screenshot`, `file_upload`/`file_download`),
the command allow/deny policy, TLS/mTLS, and the Cloudflare tunnel, and warns
about risky combinations (e.g. binding `0.0.0.0` with no IP allowlist).

Nothing is applied automatically — the app is a **config generator**. You copy
the output, review it, and apply it on your host.

## Agent API (optional)

The Review stage can save the configuration on the host running this app so
agents can read and modify it over HTTP. The endpoint is **disabled by
default** — set `WINBRIDGE_SETUP_KEY` before starting the app to enable it:

```
GET  /api/config    # read the saved config
PUT  /api/config    # replace it (JSON body: { "config": { ... } })
Authorization: Bearer <WINBRIDGE_SETUP_KEY>
```

Saved documents live in `data/winbridge-setup.config.json` and record when and
by whom (`web` or `agent`) they were last updated. Unknown fields are dropped
and missing ones fall back to defaults. The API only stores the setup
document — it never starts or reconfigures a running WinBridge server.

> Note: source-IP filtering is produced as a **firewall rule** — WinBridge does
> not yet filter source IPs in-app. See the repo roadmap.

## Run it

```bash
cd setup-web
npm install
npm run dev      # http://localhost:3000
```

Build a static/production version:

```bash
npm run build
npm start
```

## Layout

- `app/page.tsx` — the staged wizard UI (client component; state + stages).
- `app/api/config/route.ts` — the key-protected agent API (GET/PUT).
- `components/` — presentational pieces: `ui.tsx` (sections, fields, toggles,
  warnings), `stepper.tsx` (stage navigation), `output-panel.tsx` (tabbed code
  viewer), `icons.tsx` (inline SVG icons).
- `lib/winbridge-config.ts` — pure functions that turn the form state into env
  vars, firewall rules, and agent snippets (no React/DOM, easy to test).
- `lib/form-state.ts` — form-state ↔ config mapping + JSON sanitizing.
- `lib/config-store.ts` — server-side persistence for the agent API.
