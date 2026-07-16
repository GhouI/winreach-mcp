# WinBridge Setup Web

A small [Next.js](https://nextjs.org) app that helps you configure a
[WinBridge MCP](../README.md) server. Fill in the form and it generates, live in
your browser:

- the `WINBRIDGE_*` **environment variables** and a **`start.ps1`** script,
- a **Windows firewall rule** (`New-NetFirewallRule`) scoped to your allowed
  source IPs / corporate CIDRs,
- **agent-connect snippets** for Claude Code and Codex.

It toggles the opt-in tools (`take_screenshot`, `file_upload`/`file_download`),
the command allow/deny policy, TLS/mTLS, and the Cloudflare tunnel, and warns
about risky combinations (e.g. binding `0.0.0.0` with no IP allowlist).

Nothing is sent anywhere and nothing is applied automatically — the app is a
**config generator**. You copy the output, review it, and apply it on your host.

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

- `app/page.tsx` — the wizard UI (a single client component).
- `lib/winbridge-config.ts` — pure functions that turn the form state into env
  vars, firewall rules, and agent snippets (no React/DOM, easy to test).
