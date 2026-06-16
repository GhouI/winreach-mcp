import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createOutputBuffer } from "./output.js";
import { resolveShellPath } from "./shell.js";
import type {
  ExecuteOptions,
  PowerShellResult,
  PowerShellRuntimeOptions,
  SessionInfo
} from "./types.js";

type PendingCommand = {
  commandId: string;
  marker: string;
  started: number;
  stdout: ReturnType<typeof createOutputBuffer>;
  stderr: ReturnType<typeof createOutputBuffer>;
  timer: NodeJS.Timeout;
  resolve(result: PowerShellResult): void;
};

class PowerShellSession {
  readonly sessionId = randomUUID();
  readonly createdAt = new Date();
  lastUsedAt = new Date();

  private child: ChildProcessWithoutNullStreams;
  private pending?: PendingCommand;
  private queue: Array<() => void> = [];
  private closed = false;
  private stdoutText = "";

  constructor(
    private readonly runtime: PowerShellRuntimeOptions,
    private readonly cwd: string,
    env?: Record<string, string>
  ) {
    const shellPath = resolveShellPath(runtime.shellPath);
    this.child = spawn(
      shellPath,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        createBootstrapCommand()
      ],
      {
        cwd,
        env: { ...process.env, ...env },
        shell: process.platform === "win32" && shellPath.toLowerCase().endsWith(".cmd"),
        windowsHide: true
      }
    );

    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => this.pending?.stderr.append(chunk));
    this.child.on("close", () => this.failPending("PowerShell session closed"));
    this.child.on("error", (error) => this.failPending(error.message));
  }

  info(): SessionInfo {
    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt.toISOString(),
      lastUsedAt: this.lastUsedAt.toISOString(),
      cwd: this.cwd
    };
  }

  async send(options: ExecuteOptions): Promise<PowerShellResult> {
    if (this.closed) {
      throw new Error("PowerShell session is closed");
    }

    return await new Promise((resolve) => {
      const run = () => this.runCommand(options, resolve);
      if (this.pending) {
        this.queue.push(run);
      } else {
        run();
      }
    });
  }

  close(): void {
    this.closed = true;
    this.failPending("PowerShell session was closed");
    this.child.kill();
  }

  private runCommand(options: ExecuteOptions, resolve: (result: PowerShellResult) => void): void {
    const commandId = randomUUID();
    const marker = `__WINBRIDGE_END_${commandId.replaceAll("-", "_")}__`;
    const timeoutMs = options.timeoutMs ?? this.runtime.defaultTimeoutMs;
    this.stdoutText = "";
    this.lastUsedAt = new Date();

    const pending: PendingCommand = {
      commandId,
      marker,
      started: Date.now(),
      stdout: createOutputBuffer(options.maxOutputBytes ?? this.runtime.maxOutputBytes),
      stderr: createOutputBuffer(options.maxOutputBytes ?? this.runtime.maxOutputBytes),
      timer: setTimeout(() => {
        pending.stderr.append(`Command timed out after ${timeoutMs}ms`);
        this.finishPending(null);
        this.close();
      }, timeoutMs),
      resolve
    };

    this.pending = pending;
    this.child.stdin.write(`${Buffer.from(formatSessionCommand(options.command, marker), "utf8").toString("base64")}\n`);
  }

  private handleStdout(chunk: Buffer): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    this.stdoutText += chunk.toString("utf8");
    const markerIndex = this.stdoutText.indexOf(pending.marker);
    if (markerIndex === -1) {
      pending.stdout.append(chunk);
      return;
    }

    const beforeMarker = this.stdoutText.slice(0, markerIndex);
    const afterMarker = this.stdoutText.slice(markerIndex + pending.marker.length);
    const exitMatch = afterMarker.match(/:exit=(-?\d+)/);
    pending.stdout = createOutputBuffer(this.runtime.maxOutputBytes);
    pending.stdout.append(beforeMarker);
    this.finishPending(exitMatch ? Number(exitMatch[1]) : 0);
  }

  private finishPending(exitCode: number | null): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending = undefined;
    pending.resolve({
      commandId: pending.commandId,
      stdout: removePowerShellPrompts(pending.stdout.text()),
      stderr: pending.stderr.text(),
      exitCode,
      durationMs: Date.now() - pending.started,
      truncated: pending.stdout.truncated() || pending.stderr.truncated()
    });

    const next = this.queue.shift();
    next?.();
  }

  private failPending(message: string): void {
    const pending = this.pending;
    if (!pending) {
      return;
    }

    pending.stderr.append(message);
    this.finishPending(null);
  }
}

export class PowerShellSessionManager {
  private sessions = new Map<string, PowerShellSession>();

  constructor(private readonly runtime: PowerShellRuntimeOptions) {}

  open(cwd?: string, env?: Record<string, string>): SessionInfo {
    const session = new PowerShellSession(this.runtime, cwd ?? this.runtime.defaultCwd, env);
    this.sessions.set(session.sessionId, session);
    return session.info();
  }

  async send(sessionId: string, options: ExecuteOptions): Promise<PowerShellResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown PowerShell session: ${sessionId}`);
    }

    return await session.send(options);
  }

  close(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.close();
    this.sessions.delete(sessionId);
    return true;
  }

  list(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => session.info());
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }
}

function formatSessionCommand(command: string, marker: string): string {
  return `
$__winbridge_exit_code = 0
try {
${command}
  if ($?) {
    $__winbridge_exit_code = 0
  } elseif ($LASTEXITCODE -is [int]) {
    $__winbridge_exit_code = $LASTEXITCODE
  } else {
    $__winbridge_exit_code = 1
  }
} catch {
  Write-Error $_
  $__winbridge_exit_code = 1
}
[Console]::Out.WriteLine("${marker}:exit=$__winbridge_exit_code")
`;
}

function createBootstrapCommand(): string {
  return [
    "while (($line = [Console]::In.ReadLine()) -ne $null) {",
    "try {",
    "$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($line));",
    "Invoke-Expression $payload",
    "} catch {",
    "Write-Error $_",
    "}",
    "}"
  ].join(" ");
}

function removePowerShellPrompts(text: string): string {
  return text.replace(/^PS [^\r\n>]+> ?/gm, "").trim();
}
