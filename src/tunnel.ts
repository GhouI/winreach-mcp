import { spawn, spawnSync } from "node:child_process";
import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";

export type TunnelProvider = "cloudflare";

export type TunnelOptions = {
  /** Local URL cloudflared should expose, e.g. http://127.0.0.1:7573 */
  localUrl: string;
  /** Endpoint path appended to the public origin to form the MCP URL, e.g. /mcp */
  endpointPath: string;
  /** Download cloudflared automatically when it is not already available. */
  autoInstall: boolean;
  /** Explicit cloudflared binary path. Skips PATH lookup and auto-install. */
  binaryPath?: string;
  /** Milliseconds to wait for the public URL before giving up. */
  startTimeoutMs?: number;
  /** Receives human-readable progress lines. Defaults to console.log. */
  log?: (message: string) => void;
};

/**
 * Options for a named (persistent) Cloudflare tunnel. The operator brings their
 * own Cloudflare account, domain, created named tunnel, and DNS route; WinReach
 * only consumes the resulting token and runs `cloudflared` with it.
 */
export type NamedTunnelOptions = {
  /** Remotely-managed tunnel token (a secret). Selects/authenticates the tunnel. */
  token: string;
  /** Stable public hostname the tunnel resolves to, e.g. winreach.example.com. */
  hostname: string;
  /** Endpoint path appended to the public origin to form the MCP URL, e.g. /mcp */
  endpointPath: string;
  /** Download cloudflared automatically when it is not already available. */
  autoInstall: boolean;
  /** Explicit cloudflared binary path. Skips PATH lookup and auto-install. */
  binaryPath?: string;
  /** Milliseconds to wait for the tunnel to register before giving up. */
  startTimeoutMs?: number;
  /** Receives human-readable progress lines. Defaults to console.log. */
  log?: (message: string) => void;
};

export type TunnelHandle = {
  provider: TunnelProvider;
  /** Public origin, e.g. https://random-words.trycloudflare.com */
  publicUrl: string;
  /** Full MCP endpoint, e.g. https://random-words.trycloudflare.com/mcp */
  mcpUrl: string;
  /** Stop the tunnel and release the child process. */
  stop: () => Promise<void>;
};

const DEFAULT_START_TIMEOUT_MS = 30_000;
const QUICK_TUNNEL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
// cloudflared logs a line like `Registered tunnel connection connIndex=0 ...`
// (or `Connection <uuid> registered ...`) once a named tunnel is live. There is
// no URL to scrape for a named tunnel, so we treat this as the readiness signal.
const NAMED_TUNNEL_READY_PATTERN =
  /registered tunnel connection|registered connindex|connection [0-9a-f-]+ registered/i;

/** Extract the first `*.trycloudflare.com` URL from a chunk of cloudflared output. */
export function parseQuickTunnelUrl(text: string): string | undefined {
  const match = text.match(QUICK_TUNNEL_PATTERN);
  return match ? match[0] : undefined;
}

/** True when a chunk of cloudflared output reports a registered named-tunnel connection. */
export function parseNamedTunnelReady(text: string): boolean {
  return NAMED_TUNNEL_READY_PATTERN.test(text);
}

/** Normalize an operator-supplied hostname into an `https://` origin. */
export function namedTunnelPublicUrl(hostname: string): string {
  const bare = hostname
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  return `https://${bare}`;
}

/** Argv for a Cloudflare quick tunnel exposing `localUrl`. */
export function quickTunnelArgs(localUrl: string): string[] {
  return ["tunnel", "--no-autoupdate", "--http-host-header", "127.0.0.1", "--url", localUrl];
}

/**
 * Argv for a named tunnel run from a remotely-managed token. Ingress (the
 * hostname -> service mapping) lives in Cloudflare, so there is no `--url`.
 */
export function namedTunnelArgs(token: string): string[] {
  return ["tunnel", "--no-autoupdate", "--http-host-header", "127.0.0.1", "run", "--token", token];
}

/** Join a public origin and an endpoint path into a single normalized URL. */
export function buildMcpUrl(publicUrl: string, endpointPath: string): string {
  const origin = publicUrl.replace(/\/+$/, "");
  const path = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${origin}${path}`;
}

/** GitHub release asset name for cloudflared on the given platform/arch. */
export function cloudflaredAssetName(platform: NodeJS.Platform, arch: string): string {
  if (platform === "win32") {
    return arch === "arm64" ? "cloudflared-windows-arm64.exe" : "cloudflared-windows-amd64.exe";
  }

  if (platform === "linux") {
    const linuxArch = arch === "arm64" ? "arm64" : arch === "arm" ? "arm" : "amd64";
    return `cloudflared-linux-${linuxArch}`;
  }

  throw new Error(
    `Automatic cloudflared install is not supported on ${platform}/${arch}. ` +
      "Install cloudflared manually (e.g. 'brew install cloudflared') and set WINREACH_CLOUDFLARED_PATH."
  );
}

function cloudflaredDownloadUrl(assetName: string): string {
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/${assetName}`;
}

function cacheBinaryPath(platform: NodeJS.Platform): string {
  const name = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return join(homedir(), ".winreach", "bin", name);
}

function isOnPath(command: string): boolean {
  try {
    const result = spawnSync(command, ["--version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}

async function downloadCloudflared(destination: string, log: (message: string) => void): Promise<string> {
  const assetName = cloudflaredAssetName(process.platform, process.arch);
  const url = cloudflaredDownloadUrl(assetName);

  log(`Downloading cloudflared (${assetName})...`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download cloudflared from ${url}: HTTP ${response.status}`);
  }

  mkdirSync(dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const fileStream = createWriteStream(destination);
    const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    nodeStream.pipe(fileStream);
    nodeStream.on("error", reject);
    fileStream.on("error", reject);
    fileStream.on("finish", resolve);
  });

  if (process.platform !== "win32") {
    chmodSync(destination, 0o755);
  }

  log(`cloudflared saved to ${destination}`);
  return destination;
}

/**
 * Resolve a usable cloudflared binary: explicit path, then PATH, then a cached
 * download, then (when autoInstall is set) a fresh download.
 */
export async function resolveCloudflaredBinary(options: {
  autoInstall: boolean;
  binaryPath?: string;
  log: (message: string) => void;
}): Promise<string> {
  if (options.binaryPath) {
    if (!existsSync(options.binaryPath)) {
      throw new Error(`cloudflared not found at WINREACH_CLOUDFLARED_PATH: ${options.binaryPath}`);
    }
    return options.binaryPath;
  }

  if (isOnPath("cloudflared")) {
    return "cloudflared";
  }

  const cached = cacheBinaryPath(process.platform);
  if (existsSync(cached)) {
    return cached;
  }

  if (!options.autoInstall) {
    throw new Error(
      "cloudflared is not installed. Install it and retry, or enable auto-install by leaving " +
        "WINREACH_TUNNEL_AUTOINSTALL unset (it defaults to on)."
    );
  }

  return downloadCloudflared(cached, options.log);
}

/**
 * Inspect a chunk of cloudflared output and, when the tunnel is ready, return
 * the public origin to expose. Returning `undefined` means "not ready yet".
 */
type ReadyDetector = (text: string) => string | undefined;

/**
 * Shared scaffolding for both tunnel modes: resolve the binary, spawn
 * cloudflared, and resolve a {@link TunnelHandle} the first time `detectReady`
 * reports a public origin (guarding start timeout, spawn error, and early exit).
 */
async function launchCloudflared(params: {
  args: string[];
  autoInstall: boolean;
  binaryPath?: string;
  startTimeoutMs: number;
  endpointPath: string;
  log: (message: string) => void;
  startLog: string;
  detectReady: ReadyDetector;
  timeoutMessage: string;
}): Promise<TunnelHandle> {
  const binary = await resolveCloudflaredBinary({
    autoInstall: params.autoInstall,
    binaryPath: params.binaryPath,
    log: params.log
  });

  params.log(params.startLog);
  // Never log `params.args`: the named-tunnel token is a secret.
  const child = spawn(binary, params.args, { stdio: ["ignore", "pipe", "pipe"] });

  return await new Promise<TunnelHandle>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(params.timeoutMessage));
    }, params.startTimeoutMs);

    const stop = () =>
      new Promise<void>((resolveStop) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolveStop();
          return;
        }
        child.once("exit", () => resolveStop());
        child.kill();
      });

    const onChunk = (chunk: Buffer) => {
      if (settled) return;
      const publicUrl = params.detectReady(chunk.toString());
      if (!publicUrl) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const mcpUrl = buildMcpUrl(publicUrl, params.endpointPath);
      resolve({ provider: "cloudflare", publicUrl, mcpUrl, stop });
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`cloudflared exited before the tunnel was ready (code ${code ?? "unknown"})`));
    });
  });
}

/**
 * Start a Cloudflare quick tunnel that exposes `localUrl` on a public
 * `*.trycloudflare.com` origin. Quick tunnels need no Cloudflare account, and
 * Cloudflare mints a new random hostname on every launch.
 *
 * The `--http-host-header 127.0.0.1` flag rewrites the forwarded Host header to
 * loopback. The MCP SDK applies localhost DNS-rebinding protection by default,
 * which only accepts localhost/127.0.0.1/[::1] Host headers; without this,
 * tunnel requests carrying the public Host would be rejected with 403 before
 * the bearer-token check runs.
 */
export async function startCloudflareTunnel(options: TunnelOptions): Promise<TunnelHandle> {
  const log = options.log ?? ((message: string) => console.log(message));
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;

  return await launchCloudflared({
    args: quickTunnelArgs(options.localUrl),
    autoInstall: options.autoInstall,
    binaryPath: options.binaryPath,
    startTimeoutMs,
    endpointPath: options.endpointPath,
    log,
    startLog: `Starting Cloudflare quick tunnel for ${options.localUrl}...`,
    detectReady: parseQuickTunnelUrl,
    timeoutMessage: `Timed out waiting for the Cloudflare tunnel URL after ${startTimeoutMs}ms`
  });
}

/**
 * Start a named (persistent) Cloudflare tunnel from an operator-supplied token,
 * resolving to the operator's stable `hostname`. WinReach never provisions or
 * owns the tunnel: the operator creates it in their own Cloudflare account and
 * only hands WinReach the token and hostname. Ingress (hostname -> service)
 * lives in Cloudflare, so the public origin is known ahead of time — there is
 * no URL to scrape; readiness is detected from the registered-connection log.
 *
 * `--http-host-header 127.0.0.1` is kept for the same DNS-rebinding reason as
 * the quick-tunnel path.
 */
export async function startNamedCloudflareTunnel(options: NamedTunnelOptions): Promise<TunnelHandle> {
  const log = options.log ?? ((message: string) => console.log(message));
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const publicUrl = namedTunnelPublicUrl(options.hostname);

  return await launchCloudflared({
    args: namedTunnelArgs(options.token),
    autoInstall: options.autoInstall,
    binaryPath: options.binaryPath,
    startTimeoutMs,
    endpointPath: options.endpointPath,
    log,
    startLog: `Starting named Cloudflare tunnel for ${publicUrl}...`,
    detectReady: (text) => (parseNamedTunnelReady(text) ? publicUrl : undefined),
    timeoutMessage: `Timed out waiting for the named Cloudflare tunnel to register after ${startTimeoutMs}ms`
  });
}
