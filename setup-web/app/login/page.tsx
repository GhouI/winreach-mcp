"use client";

// Admin login / first-run signup. The form shown depends on bootstrap state
// from /api/auth/session: no DB -> direct to setup; no admin yet -> create the
// first admin; otherwise -> sign in.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Field, Section, TextInput, Warn } from "@/components/ui";
import { AdminShell, StatusMsg, btnPrimary } from "@/components/admin-shell";
import { KeyIcon, LinkIcon, LockIcon } from "@/components/icons";

type Boot = {
  dbConfigured: boolean;
  schemaReady: boolean;
  sessionSecret: boolean;
  adminExists: boolean;
  authenticated: boolean;
  error?: string;
};

export default function LoginPage() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () =>
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d: Boot) => {
        setBoot(d);
        if (d.authenticated) window.location.href = "/admin";
      })
      .catch(() => setBoot(null));

  useEffect(() => {
    void refresh();
  }, []);

  const isSignup = boot ? boot.dbConfigured && boot.schemaReady && !boot.adminExists : false;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(isSignup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? `Request failed (${res.status}).`);
        return;
      }
      window.location.href = "/admin";
    } catch {
      setErr("Could not reach the login API on this host.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell crumb="Admin login">
      <div className="mx-auto max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <LockIcon className="size-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">
            {isSignup ? "Create the first admin" : "Admin sign in"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {isSignup
              ? "No admin exists yet. Create one to manage account keys."
              : "Sign in to manage WinBridge account keys."}
          </p>
        </div>

        {!boot && <p className="text-center text-sm text-muted">Checking status…</p>}

        {boot && !boot.dbConfigured && (
          <Section icon={<KeyIcon className="size-4" />} title="Database required" desc="Configure a backend before logging in.">
            {boot.error && <Warn>{boot.error}</Warn>}
            <Link href="/admin/setup" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              <LinkIcon className="size-3.5" />
              Go to Database setup
            </Link>
          </Section>
        )}

        {boot && boot.dbConfigured && !boot.schemaReady && (
          <Section icon={<KeyIcon className="size-4" />} title="Schema not ready" desc="Finish creating the schema first.">
            {boot.error && <Warn>{boot.error}</Warn>}
            <Link href="/admin/setup" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              <LinkIcon className="size-3.5" />
              Go to Database setup
            </Link>
          </Section>
        )}

        {boot && boot.dbConfigured && boot.schemaReady && !boot.sessionSecret && (
          <Section icon={<KeyIcon className="size-4" />} title="Session secret required" desc="Sessions can't be signed.">
            <Warn>
              Set <code className="font-mono">WINBRIDGE_SESSION_SECRET</code> (or{" "}
              <code className="font-mono">WINBRIDGE_DB_KEY</code>) on this host, then reload.
            </Warn>
          </Section>
        )}

        {boot && boot.dbConfigured && boot.schemaReady && boot.sessionSecret && (
          <Section
            icon={<LockIcon className="size-4" />}
            title={isSignup ? "New admin" : "Sign in"}
            desc={isSignup ? "Choose a username and a password (8+ characters)." : undefined}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && username.trim() && password) void submit();
              }}
              className="space-y-4"
            >
              <Field label="Username">
                <TextInput value={username} onChange={setUsername} placeholder="admin" mono />
              </Field>
              <Field label="Password" hint={isSignup ? "At least 8 characters." : undefined}>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-xs outline-none transition hover:border-border-strong focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </Field>
              {err && <StatusMsg tone="err">{err}</StatusMsg>}
              <button
                type="submit"
                disabled={busy || !username.trim() || !password}
                className={`${btnPrimary} w-full`}
              >
                {busy ? "Working…" : isSignup ? "Create admin & continue" : "Sign in"}
              </button>
            </form>
          </Section>
        )}
      </div>
    </AdminShell>
  );
}
