import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createOutputBuffer } from "../powershell/output.js";
import { resolveBashPath } from "./shell.js";
import type {
  BashExecuteOptions,
  BashResult,
  BashRuntimeOptions,
  BashSessionInfo
} from "./types.js";

type PendingCommand = {
  commandId: string;
  marker: string;
  started: number;
  stdout: ReturnType<typeof createOutputBuffer>;
  stderr: ReturnType<typeof createOutputBuffer>;
  timer: NodeJS.Timeout;
  resolve(result: BashResult): void;
};

/**
 * A persistent Git Bash process driven over stdin. Mirrors `PowerShellSession`:
 * each command is base64-wrapped and evaluated by a long-lived read loop, then a
 * unique end marker carrying `$?` frames the output and yields the exit code.
 */
class BashSession {
  readonly sessionId = randomUUID();
  readonly createdAt = new Date();
  lastUsedAt = new Date();

  private child: ChildProcessWithoutNullStreams;
  private pending?: PendingCommand;
  private queue: Array<() => void> = [];
  private closed = false;
  private stdoutText = "";

  constructor(
    private readonly runtime: BashRuntimeOptions,
    private readonly cwd: string,
    env?: Record<string, string>
  ) {
    const bashPath = resolveBashPath(runtime.bashPath);
    if (!bashPath) {
      throw new Error("Git Bash (bash.exe) is not available. Set WINREACH_BASH_PATH.");
    }

    this.child = spawn(bashPath, ["-l", "-c", createBootstrapCommand()], {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true
    });

    this.child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => this.pending?.stderr.append(chunk));
    this.child.on("close", () => this.failPending("Bash session closed"));
    this.child.on("error", (error) => this.failPending(error.message));
  }

  info(): BashSessionInfo {
    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt.toISOString(),
      lastUsedAt: this.lastUsedAt.toISOString(),
      cwd: this.cwd
    };
  }

  async send(options: BashExecuteOptions): Promise<BashResult> {
    if (this.closed) {
      throw new Error("Bash session is closed");
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
    this.failPending("Bash session was closed");
    this.child.kill();
  }

  private runCommand(options: BashExecuteOptions, resolve: (result: BashResult) => void): void {
    const commandId = randomUUID();
    const marker = `__WINREACH_END_${commandId.replaceAll("-", "_")}__`;
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
    const payload = Buffer.from(formatSessionCommand(options.command, marker), "utf8").toString("base64");
    this.child.stdin.write(`${payload}\n`);
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
      stdout: pending.stdout.text().replace(/\r?\n$/, ""),
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

export class BashSessionManager {
  private sessions = new Map<string, BashSession>();

  constructor(private readonly runtime: BashRuntimeOptions) {}

  open(cwd?: string, env?: Record<string, string>): BashSessionInfo {
    const session = new BashSession(this.runtime, cwd ?? this.runtime.defaultCwd, env);
    this.sessions.set(session.sessionId, session);
    return session.info();
  }

  async send(sessionId: string, options: BashExecuteOptions): Promise<BashResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown bash session: ${sessionId}`);
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

  list(): BashSessionInfo[] {
    return Array.from(this.sessions.values()).map((session) => session.info());
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.close();
    }
    this.sessions.clear();
  }
}

/**
 * The bash analogue of `formatSessionCommand`: run the command, capture its exit
 * code, then emit the end marker with that code so the manager can frame output
 * and read `$?`.
 */
function formatSessionCommand(command: string, marker: string): string {
  return [command, "__winreach_ec=$?", `printf '%s:exit=%d\\n' "${marker}" "$__winreach_ec"`].join("\n");
}

/**
 * Long-lived read loop: each stdin line is a base64-encoded command payload,
 * decoded and evaluated. base64 framing lets a multi-line command travel as a
 * single stdin line, exactly like the PowerShell bootstrap.
 */
function createBootstrapCommand(): string {
  return [
    "while IFS= read -r __winreach_line; do",
    '  eval "$(printf \'%s\' "$__winreach_line" | base64 --decode)"',
    "done"
  ].join("\n");
}
