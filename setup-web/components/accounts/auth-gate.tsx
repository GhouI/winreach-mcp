"use client";

import { useState } from "react";
import { Field, Section, StatusMsg, TextInput, btnPrimary } from "@/components/ui";

/**
 * Sign-in / first-admin signup gate. First-admin creation is gated by the
 * setup key so only the operator can claim the admin.
 */
export function AuthGate({ signup, onDone }: { signup: boolean; onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit = Boolean(username.trim() && password && (!signup || setupKey.trim()));

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // First-admin creation is gated by the setup key so only the operator
          // can claim the admin.
          ...(signup ? { authorization: `Bearer ${setupKey.trim()}` } : {}),
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? `Request failed (${res.status}).`);
        return;
      }
      onDone();
    } catch {
      setErr("Could not reach the login API on this host.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Section
        title={signup ? "Create the first admin" : "Admin sign in"}
        desc={
          signup
            ? "No admin exists yet. Creating it requires the setup key so only the operator can claim the first admin."
            : "Sign in to manage WinReach account keys."
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && canSubmit) void submit();
          }}
          className="space-y-5"
        >
          {signup && (
            <Field label="Setup key" hint="Must match WINREACH_SETUP_KEY on this host.">
              <TextInput value={setupKey} onChange={setSetupKey} placeholder="paste your setup key" mono />
            </Field>
          )}
          <Field label="Username">
            <TextInput value={username} onChange={setUsername} placeholder="admin" mono />
          </Field>
          <Field label="Password" hint={signup ? "At least 12 characters." : undefined}>
            <TextInput value={password} onChange={setPassword} type="password" />
          </Field>
          {err && <StatusMsg tone="err">{err}</StatusMsg>}
          <button type="submit" disabled={busy || !canSubmit} className={`${btnPrimary} w-full`}>
            {busy ? "Working…" : signup ? "Create admin & continue" : "Sign in"}
          </button>
        </form>
      </Section>
    </div>
  );
}
