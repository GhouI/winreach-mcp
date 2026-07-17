# syntax=docker/dockerfile:1

# WinReach MCP server image.
#
# The server targets Windows + powershell.exe, but resolveShellPath() falls back
# to `pwsh` off-Windows, so a Linux container runs against PowerShell 7. Screen
# capture and other interactive-desktop tools do not work headless in Linux — that
# is expected; powershell_execute / sessions / file transfer all work.

# ---- build stage: compile TypeScript to dist/ ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
RUN npm run build

# ---- runtime stage: production deps + PowerShell 7 ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Install PowerShell 7 (pwsh) from the official GitHub release .deb. Its runtime
# deps (libicu, libssl, less) are resolved by `apt-get install -f`.
ARG PS_VERSION=7.4.6
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${PS_VERSION}/powershell_${PS_VERSION}-1.deb_amd64.deb" -o /tmp/ps.deb \
  && (dpkg -i /tmp/ps.deb || apt-get install -f -y --no-install-recommends) \
  && rm -f /tmp/ps.deb \
  && apt-get purge -y curl \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* \
  && pwsh --version

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The server falls back to `pwsh` off-Windows; make it explicit.
ENV WINREACH_SHELL_PATH=pwsh \
    WINREACH_HOST=0.0.0.0 \
    WINREACH_PORT=7573 \
    NODE_ENV=production

EXPOSE 7573

# WINREACH_TOKEN (or WINREACH_PRINCIPALS) must be supplied at run time.
CMD ["node", "dist/src/server.js"]
