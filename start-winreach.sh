#!/usr/bin/env bash
#
# One-command launcher for WinReach MCP (Git Bash / sh equivalent of
# start-winreach.ps1).
#
# Goes from nothing to a running WinReach server in a single command:
#   1. Ensures WinReach is available (runs it via `npx winreach-mcp`, no clone/build)
#      and checks that Node.js / npx are on PATH.
#   2. Decides whether setup is complete: complete when WINREACH_TOKEN /
#      WINREACH_PRINCIPALS is set, or the onboarding UI has written the config file
#      ~/.winreach/winreach.env.
#   3. First run (no config): opens the setup-web onboarding UI, waits for it to write
#      the config file, then loads it and starts the server. Subsequent runs (config
#      present): loads the saved config and starts the server directly.
#
# This is a launcher SCRIPT, not an installer or a binary: WinReach is a
# web-controlled MCP server. Re-running it pulls the newest published version.
#
# Usage:
#   ./start-winreach.sh [--tunnel] [--force-setup] [-- <extra winreach-mcp args>]
# Env:
#   WINREACH_VERSION   npm version/tag to run (default: latest)
#   WINREACH_TOKEN / WINREACH_PRINCIPALS   if set, onboarding is skipped
#
# Bootstrap (see README for the SHA-256 to verify first):
#   curl -fsSL https://github.com/GhouI/winreach-mcp/releases/latest/download/start-winreach.sh | bash

set -euo pipefail

VERSION="${WINREACH_VERSION:-latest}"
TUNNEL=0
FORCE_SETUP=0
EXTRA_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tunnel)      TUNNEL=1; shift ;;
    --force-setup) FORCE_SETUP=1; shift ;;
    --version)     VERSION="$2"; shift 2 ;;
    --)            shift; EXTRA_ARGS+=("$@"); break ;;
    *)             EXTRA_ARGS+=("$1"); shift ;;
  esac
done

CONFIG_DIR="${HOME}/.winreach"
CONFIG_FILE="${CONFIG_DIR}/winreach.env"
ONBOARD_URL="http://localhost:3000"

step() { printf '\033[36m[winreach]\033[0m %s\n' "$1"; }
bad()  { printf '\033[31m[winreach]\033[0m %s\n' "$1" >&2; }

# --- 1. Ensure a runnable WinReach (Node + npx) ---------------------------------
if ! command -v node >/dev/null 2>&1 || ! command -v npx >/dev/null 2>&1; then
  bad "Node.js (with npx) was not found on your PATH."
  bad "WinReach runs on Node.js 18 or newer. Install it, then re-run this script:"
  bad "  https://nodejs.org/en/download"
  exit 1
fi

# Load a dotenv-style file (KEY=VALUE lines) into the environment.
load_env_file() {
  # shellcheck disable=SC2163
  while IFS= read -r raw || [ -n "$raw" ]; do
    line="${raw#"${raw%%[![:space:]]*}"}"   # ltrim
    case "$line" in ''|\#*) continue ;; esac
    name="${line%%=*}"
    value="${line#*=}"
    [ "$name" = "$line" ] && continue        # no '=' on the line
    export "$name=$value"
  done < "$1"
}

# Open a URL in the default browser (best effort across environments).
open_url() {
  if command -v cmd.exe >/dev/null 2>&1; then cmd.exe /c start "" "$1" >/dev/null 2>&1 || true
  elif command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command "Start-Process '$1'" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then open "$1" >/dev/null 2>&1 || true
  else step "Open this URL in your browser: $1"; fi
}

# --- 2. Determine setup state ---------------------------------------------------
setup_complete=0
if [ -n "${WINREACH_TOKEN:-}" ] || [ -n "${WINREACH_PRINCIPALS:-}" ]; then
  step "Found WINREACH_TOKEN/WINREACH_PRINCIPALS in the environment; setup is complete."
  setup_complete=1
elif [ -f "$CONFIG_FILE" ]; then
  step "Loading saved configuration from $CONFIG_FILE"
  load_env_file "$CONFIG_FILE"
  setup_complete=1
fi

[ "$FORCE_SETUP" -eq 1 ] && setup_complete=0

# --- 3. First run: open the onboarding UI ---------------------------------------
if [ "$setup_complete" -eq 0 ]; then
  step "No WinReach configuration found - starting first-run onboarding."

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
  SETUP_WEB="${SCRIPT_DIR}/setup-web"

  if [ ! -f "${SETUP_WEB}/package.json" ]; then
    bad "First run needs the setup-web onboarding app, which is not present here."
    bad "Run this launcher from a WinReach checkout (it ships setup-web), or set"
    bad "WINREACH_TOKEN (or WINREACH_PRINCIPALS) yourself and re-run. See:"
    bad "  https://github.com/GhouI/winreach-mcp#install--connect"
    exit 1
  fi

  # The onboarding /api/apply endpoint is gated by WINREACH_SETUP_KEY; mint one so
  # the operator can paste it into the UI to finish setup.
  if [ -z "${WINREACH_SETUP_KEY:-}" ]; then
    if command -v node >/dev/null 2>&1; then
      WINREACH_SETUP_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
    else
      WINREACH_SETUP_KEY="$(date +%s)-$RANDOM"
    fi
    export WINREACH_SETUP_KEY
  fi

  if [ ! -d "${SETUP_WEB}/node_modules" ]; then
    step "Installing onboarding UI dependencies (first time only)..."
    npm install --prefix "$SETUP_WEB"
  fi

  step "Launching the onboarding UI at $ONBOARD_URL"
  printf '\n  \033[33mPaste this setup key into the wizard'\''s final '\''Finish & apply'\'' step:\033[0m\n'
  printf '      \033[32m%s\033[0m\n\n' "$WINREACH_SETUP_KEY"

  ( cd "$SETUP_WEB" && npm run dev ) &
  ONBOARD_PID=$!
  # shellcheck disable=SC2064
  trap "kill $ONBOARD_PID >/dev/null 2>&1 || true" EXIT

  sleep 4
  open_url "$ONBOARD_URL"

  step "Waiting for you to finish onboarding (writing $CONFIG_FILE)..."
  while [ ! -f "$CONFIG_FILE" ]; do
    if ! kill -0 "$ONBOARD_PID" >/dev/null 2>&1; then
      bad "The onboarding UI exited before setup was completed."
      exit 1
    fi
    sleep 2
  done
  step "Onboarding complete."
  load_env_file "$CONFIG_FILE"

  kill "$ONBOARD_PID" >/dev/null 2>&1 || true
  trap - EXIT
fi

# --- 4. Start the MCP server ----------------------------------------------------
NPX_ARGS=("-y" "winreach-mcp@${VERSION}")
[ "$TUNNEL" -eq 1 ] && NPX_ARGS+=("--tunnel")
[ "${#EXTRA_ARGS[@]}" -gt 0 ] && NPX_ARGS+=("${EXTRA_ARGS[@]}")

step "Starting WinReach MCP server: npx ${NPX_ARGS[*]}"
exec npx "${NPX_ARGS[@]}"
