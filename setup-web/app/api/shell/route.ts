// Host console endpoint. Executes ONE submitted command on this host's default
// shell (PowerShell on Windows, /bin/sh elsewhere) and returns the captured
// output. Simple request/response — no PTY, no streaming.
//
//   POST /api/shell  { command }  ->  { stdout, stderr, exitCode, timedOut, truncated, shell }
//
// SECURITY: this is remote code execution by design, so it is locked to the
// admin session (same requireAdmin gate as /api/users — signed httpOnly cookie
// backed by the account store). Every request re-verifies the session. A hard
// timeout and output cap bound each run. Nothing is logged server-side —
// commands and output may contain secrets.

import { execFile, type ExecFileException } from "node:child_process";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/store/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000; // hard wall-clock limit per command
const MAX_BUFFER = 1024 * 1024; // 1 MiB per stream while running
const MAX_CHARS = 100_000; // per-stream cap on the JSON response
const MAX_COMMAND_LENGTH = 4_000;

type ShellResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  truncated: boolean;
};

function shellFor(platform: NodeJS.Platform): { file: string; args: (cmd: string) => string[]; label: string } {
  if (platform === "win32") {
    // PowerShell is WinBridge's native shell; ComSpec (cmd.exe) is the fallback.
    return {
      file: "powershell.exe",
      args: (cmd) => ["-NoProfile", "-NonInteractive", "-Command", cmd],
      label: "powershell",
    };
  }
  return { file: "/bin/sh", args: (cmd) => ["-c", cmd], label: "sh" };
}

function runCommand(command: string): Promise<ShellResult> {
  const shell = shellFor(process.platform);
  return new Promise((resolve) => {
    execFile(
      shell.file,
      shell.args(command),
      {
        timeout: TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0, timedOut: false, truncated: false });
          return;
        }
        const e = error as ExecFileException & { code?: number | string };
        const truncated = e.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
        const timedOut = !truncated && e.killed === true;
        const exitCode = typeof e.code === "number" ? e.code : -1;
        resolve({
          stdout: stdout ?? "",
          // Spawn failures (e.g. shell not found) produce no stderr — surface the message.
          stderr: (stderr ?? "") || (stdout ? "" : e.message),
          exitCode,
          timedOut,
          truncated,
        });
      },
    );
  });
}

function cap(text: string): { text: string; cut: boolean } {
  return text.length > MAX_CHARS ? { text: text.slice(0, MAX_CHARS), cut: true } : { text, cut: false };
}

export async function POST(req: NextRequest) {
  // Admin session required — identical gate to the accounts API.
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const command = typeof (body as { command?: unknown })?.command === "string"
    ? ((body as { command: string }).command)
    : "";
  if (!command.trim()) {
    return NextResponse.json({ error: "command is required." }, { status: 400 });
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return NextResponse.json(
      { error: `Command too long (max ${MAX_COMMAND_LENGTH} characters).` },
      { status: 400 },
    );
  }

  const result = await runCommand(command);
  const out = cap(result.stdout);
  const err = cap(result.stderr);
  return NextResponse.json({
    stdout: out.text,
    stderr: err.text,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    truncated: result.truncated || out.cut || err.cut,
    shell: shellFor(process.platform).label,
  });
}
