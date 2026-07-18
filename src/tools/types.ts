import type { AppConfig } from "../config.js";
import type { AuditLogger } from "../audit.js";
import type { Principal } from "../principals.js";
import type { PowerShellSessionManager } from "../powershell/session.js";
import type { BashSessionManager } from "../bash/session.js";

/**
 * Shared context handed to every tool-registration child. It bundles the
 * server-wide config plus the per-request principal, session manager, audit
 * logger, and the tool-allowlist gate. Children read from this; they never
 * reach back into the server assembly.
 */
export interface ToolContext {
  config: AppConfig;
  sessions: PowerShellSessionManager;
  /** Persistent Git Bash sessions, sibling to the PowerShell `sessions`. */
  bashSessions: BashSessionManager;
  principal: Principal;
  audit: AuditLogger;
  /**
   * A principal with a `tools` allowlist only sees the tools it lists; without
   * one it sees every tool (subject to the per-tool gates in each child).
   */
  allowsTool: (tool: string) => boolean;
}
