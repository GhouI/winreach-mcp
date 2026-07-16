import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * A single audited action. Written as one JSON object per line (JSONL) so the
 * log is easy to tail, grep, and ship to a SIEM.
 */
export type AuditEntry = {
  time: string;
  principal: string;
  role: string;
  tool: string;
  /** "allowed", "blocked", or "error" — the authorization outcome. */
  decision: "allowed" | "blocked" | "error";
  command?: string;
  cwd?: string;
  sessionId?: string;
  reason?: string;
  exitCode?: number | null;
  durationMs?: number;
  /** Captured image size in bytes, for take_screenshot. */
  bytes?: number;
  /** Server-side path a take_screenshot capture was written to. */
  path?: string;
};

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

/** No-op logger used when auditing is disabled. */
class NullAuditLogger implements AuditLogger {
  async log(): Promise<void> {
    // intentionally does nothing
  }
}

/**
 * Append-only JSONL file logger. Writes are serialized through an internal
 * promise chain so concurrent tool calls cannot interleave partial lines, and a
 * write failure is reported once to stderr rather than crashing the request.
 */
class FileAuditLogger implements AuditLogger {
  private queue: Promise<void> = Promise.resolve();
  private directoryReady = false;
  private warned = false;

  constructor(private readonly filePath: string) {}

  log(entry: AuditEntry): Promise<void> {
    this.queue = this.queue.then(() => this.write(entry));
    return this.queue;
  }

  private async write(entry: AuditEntry): Promise<void> {
    try {
      if (!this.directoryReady) {
        await mkdir(dirname(this.filePath), { recursive: true });
        this.directoryReady = true;
      }
      await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
    } catch (error) {
      if (!this.warned) {
        this.warned = true;
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`WinBridge audit logging to ${this.filePath} failed: ${detail}`);
      }
    }
  }
}

/**
 * Build an audit logger. Returns a no-op logger when `filePath` is undefined so
 * callers never need to branch on whether auditing is enabled.
 */
export function createAuditLogger(filePath?: string): AuditLogger {
  return filePath ? new FileAuditLogger(filePath) : new NullAuditLogger();
}
