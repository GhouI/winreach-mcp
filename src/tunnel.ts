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

/** Extract the first `*.trycloudflare.com` URL from a chunk of cloudflared output. */
export function parseQuickTunnelUrl(text: string): string | undefined {
  const match = text.match(QUICK_TUNNEL_PATTERN);
  return match ? match[0] : undefined;
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
      "Install cloudflared manually (e.g. 'brew install cloudflared') and set WINBRIDGE_CLOUDFLARED_PATH."
  );
}

function cloudflaredDownloadUrl(assetName: string): string {
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/${assetName}`;
}

function cacheBinaryPath(platform: NodeJS.Platform): string {
  const name = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return join(homedir(), ".winbridge", "bin", name);
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
      throw new Error(`cloudflared not found at WINBRIDGE_CLOUDFLARED_PATH: ${options.binaryPath}`);
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
        "WINBRIDGE_TUNNEL_AUTOINSTALL unset (it defaults to on)."
    );
  }

  return downloadCloudflared(cached, options.log);
}

/**
 * Start a Cloudflare quick tunnel that exposes `localUrl` on a public
 * `*.trycloudflare.com` origin. Quick tunnels need no Cloudflare account.
 */
export async function startCloudflareTunnel(options: TunnelOptions): Promise<TunnelHandle> {
  const log = options.log ?? ((message: string) => console.log(message));
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;

  const binary = await resolveCloudflaredBinary({
    autoInstall: options.autoInstall,
    binaryPath: options.binaryPath,
    log
  });

  log(`Starting Cloudflare quick tunnel for ${options.localUrl}...`);
  const child = spawn(
    binary,
    ["tunnel", "--no-autoupdate", "--url", options.localUrl],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  return await new Promise<TunnelHandle>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Timed out waiting for the Cloudflare tunnel URL after ${startTimeoutMs}ms`));
    }, startTimeoutMs);

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
      const text = chunk.toString();
      const publicUrl = parseQuickTunnelUrl(text);
      if (!publicUrl || settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const mcpUrl = buildMcpUrl(publicUrl, options.endpointPath);
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
      reject(new Error(`cloudflared exited before announcing a tunnel URL (code ${code ?? "unknown"})`));
    });
  });
}
