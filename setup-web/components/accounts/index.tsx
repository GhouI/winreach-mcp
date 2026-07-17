"use client";

// Dashboard panel for database-backed accounts (admin login + per-user agent
// keys). The whole lifecycle is gated inline — no separate pages:
//
//   no DB / schema     -> pointer to the Database panel
//   no session secret  -> env instructions
//   no admin yet       -> create the first admin (signup)
//   not signed in      -> sign in
//   signed in          -> account manager (create / edit / rotate / delete /
//                         export WINBRIDGE_PRINCIPALS)

import { Section, Warn, btnPrimary } from "@/components/ui";
import { AuthGate } from "./auth-gate";
import { Manager } from "./manager";
import type { Boot } from "./types";

export type { Boot } from "./types";

export function AccountsPanel({
  boot,
  onBootChange,
  gotoDatabase,
}: {
  boot: Boot | null;
  /** Ask the parent to re-fetch /api/auth/session (after login/logout/setup). */
  onBootChange: () => void;
  gotoDatabase: () => void;
}) {
  if (!boot) {
    return <p className="text-sm text-muted">Checking status…</p>;
  }

  if (!boot.dbConfigured || !boot.schemaReady) {
    return (
      <Section
        title="Database required"
        desc="Accounts are stored in a database. Configure a backend before creating admin logins or agent keys."
      >
        {boot.error && <Warn>{boot.error}</Warn>}
        <button type="button" onClick={gotoDatabase} className={btnPrimary}>
          Set up the database
        </button>
      </Section>
    );
  }

  if (!boot.sessionSecret) {
    return (
      <Section title="Session secret required" desc="Sessions cannot be signed without a secret.">
        <Warn>
          Set <code className="font-mono">WINBRIDGE_SESSION_SECRET</code> (or{" "}
          <code className="font-mono">WINBRIDGE_DB_KEY</code>) on this host, then reload.
        </Warn>
      </Section>
    );
  }

  if (!boot.authenticated) {
    return <AuthGate signup={!boot.adminExists} onDone={onBootChange} />;
  }

  return <Manager username={boot.admin?.username ?? ""} onBootChange={onBootChange} />;
}
