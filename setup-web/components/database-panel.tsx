"use client";

// Dashboard panel for the account-store backend. Pick a backend, Test the
// connection, then Set up (create/validate the schema). Guarded by
// WINBRIDGE_SETUP_KEY (same bearer scheme as the agent config API).

import { useState } from "react";
import { Field, Grid, Section, StatusMsg, TextInput, Warn, btnPrimary, btnSecondary } from "@/components/ui";

type StoreKind = "sqlite" | "postgres" | "mysql" | "mongodb";
type StoreStatus = {
  connected: boolean;
  schemaReady: boolean;
  created: boolean;
  missing: string[];
  detail?: string;
  schemaVersion?: number;
};

const KINDS: { id: StoreKind; label: string; blurb: string }[] = [
  { id: "sqlite", label: "SQLite", blurb: "Local file — zero setup" },
  { id: "postgres", label: "PostgreSQL", blurb: "Connection URL" },
  { id: "mysql", label: "MySQL", blurb: "Connection URL" },
  { id: "mongodb", label: "MongoDB", blurb: "Connection URL" },
];

export function DatabasePanel({
  onConfigured,
  gotoAccounts,
}: {
  /** Called after a successful Set up so the caller can refresh boot state. */
  onConfigured: () => void;
  gotoAccounts: () => void;
}) {
  const [setupKey, setSetupKey] = useState("");
  const [kind, setKind] = useState<StoreKind>("sqlite");
  const [file, setFile] = useState("data/winbridge.sqlite");
  const [url, setUrl] = useState("");
  const [database, setDatabase] = useState("");

  const [busy, setBusy] = useState<"" | "test" | "setup" | "load">("");
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const buildConfig = () =>
    kind === "sqlite"
      ? { kind, file: file.trim() || "data/winbridge.sqlite" }
      : kind === "mongodb"
        ? { kind, url: url.trim(), database: database.trim() || undefined }
        : { kind, url: url.trim() };

  const call = async (action: "test" | "setup") => {
    setBusy(action);
    setMsg(null);
    try {
      const res = await fetch("/api/db", {
        method: "POST",
        headers: { authorization: `Bearer ${setupKey.trim()}`, "content-type": "application/json" },
        body: JSON.stringify({ action, config: buildConfig() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok === false) {
        setStatus(data?.status ?? null);
        setMsg({ tone: "err", text: data?.error ?? `Request failed (${res.status}).` });
        return;
      }
      setStatus(data.status as StoreStatus);
      setMsg({
        tone: "ok",
        text:
          action === "test"
            ? "Connected. Review the schema status below."
            : data.status?.schemaReady
              ? "Schema is ready and the configuration was saved on this host."
              : "Saved, but the schema is not ready — see missing fields below.",
      });
      if (action === "setup") onConfigured();
    } catch {
      setMsg({ tone: "err", text: "Could not reach the setup API on this host." });
    } finally {
      setBusy("");
    }
  };

  const loadCurrent = async () => {
    setBusy("load");
    setMsg(null);
    try {
      const res = await fetch("/api/db", {
        headers: { authorization: `Bearer ${setupKey.trim()}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ tone: "err", text: data?.error ?? `Request failed (${res.status}).` });
        return;
      }
      if (!data?.configured) {
        setMsg({ tone: "ok", text: "No database is configured yet." });
        setStatus(null);
        return;
      }
      if (data?.meta?.kind) setKind(data.meta.kind);
      if (data?.meta?.file) setFile(data.meta.file);
      if (data?.meta?.database) setDatabase(data.meta.database);
      setStatus(data.status ?? null);
      setMsg({
        tone: data?.status?.schemaReady ? "ok" : "err",
        text: data?.error
          ? data.error
          : `Configured backend: ${data.meta.kind}${
              data.status?.schemaReady ? " — schema ready." : " — schema not ready."
            }`,
      });
    } catch {
      setMsg({ tone: "err", text: "Could not reach the setup API on this host." });
    } finally {
      setBusy("");
    }
  };

  const needsKey = kind !== "sqlite";

  return (
    <div className="space-y-5">
      <Section
        title="Backend"
        desc="Where WinBridge stores admin logins and account keys. The app creates tables if missing and validates an existing schema — it never drops or alters your data. See docs/database.md for the canonical schema."
      >
        <Field label="Engine" asDiv>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                aria-pressed={kind === k.id}
                className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                  kind === k.id
                    ? "border-foreground bg-surface-muted/60"
                    : "border-border bg-surface hover:bg-surface-muted"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{k.label}</span>
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${
                      kind === k.id ? "bg-accent" : "border border-border-strong"
                    }`}
                  />
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-muted">{k.blurb}</span>
              </button>
            ))}
          </div>
        </Field>

        {kind === "sqlite" ? (
          <Field label="SQLite file path" hint="Relative to the app, or an absolute path.">
            <TextInput value={file} onChange={setFile} placeholder="data/winbridge.sqlite" mono />
          </Field>
        ) : (
          <Grid>
            <Field
              label="Connection URL"
              hint="Include credentials + TLS params. Encrypted at rest with WINBRIDGE_DB_KEY."
            >
              <TextInput
                value={url}
                onChange={setUrl}
                placeholder={
                  kind === "postgres"
                    ? "postgresql://user:pass@host:5432/db?sslmode=require"
                    : kind === "mysql"
                      ? "mysql://user:pass@host:3306/db?ssl={\"rejectUnauthorized\":true}"
                      : "mongodb+srv://user:pass@cluster/db"
                }
                mono
              />
            </Field>
            {kind === "mongodb" && (
              <Field label="Database name" hint="Optional if included in the URL.">
                <TextInput value={database} onChange={setDatabase} placeholder="winbridge" mono />
              </Field>
            )}
          </Grid>
        )}

        {needsKey && (
          <Warn>
            Non-SQLite backends require <code className="font-mono">WINBRIDGE_DB_KEY</code> to be
            set on this host so the connection string is encrypted at rest. Set it before running
            Set up.
          </Warn>
        )}
      </Section>

      <Section
        title="Test & set up"
        desc="Test connects and reports schema status. Set up creates/validates it and saves the config."
      >
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          These actions require the <code className="font-mono">WINBRIDGE_SETUP_KEY</code> set on
          this host (the same key the agent config API uses).
        </p>
        <Field label="Setup key" hint="Must match WINBRIDGE_SETUP_KEY on this host.">
          <TextInput value={setupKey} onChange={setSetupKey} placeholder="paste your setup key" mono />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!!busy || !setupKey.trim()}
            onClick={() => call("test")}
            className={btnSecondary}
          >
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            disabled={!!busy || !setupKey.trim()}
            onClick={() => call("setup")}
            className={btnPrimary}
          >
            {busy === "setup" ? "Setting up…" : "Set up"}
          </button>
          <button
            type="button"
            disabled={!!busy || !setupKey.trim()}
            onClick={loadCurrent}
            className={btnSecondary}
          >
            {busy === "load" ? "Loading…" : "Current status"}
          </button>
        </div>
        {msg && <StatusMsg tone={msg.tone}>{msg.text}</StatusMsg>}
        {status && <StatusView status={status} />}
        {status?.schemaReady && (
          <button
            type="button"
            onClick={gotoAccounts}
            className="text-sm font-medium text-accent-text hover:underline"
          >
            Continue to Accounts →
          </button>
        )}
      </Section>
    </div>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok?: boolean; text: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`text-[13px] font-medium ${
          ok === undefined ? "" : ok ? "text-ok" : "text-warn"
        }`}
      >
        {text}
      </dd>
    </div>
  );
}

function StatusView({ status }: { status: StoreStatus }) {
  return (
    <dl className="rounded-md border border-border bg-background/60 px-4 py-1">
      <StatusRow label="Connected" ok={status.connected} text={status.connected ? "Yes" : "No"} />
      <StatusRow label="Schema created this run" text={status.created ? "Yes" : "No"} />
      <StatusRow label="Schema ready" ok={status.schemaReady} text={status.schemaReady ? "Ready" : "Not ready"} />
      {status.schemaVersion !== undefined && (
        <StatusRow label="Schema version" text={String(status.schemaVersion)} />
      )}
      {status.missing.length > 0 && (
        <StatusRow label="Missing" ok={false} text={status.missing.join(", ")} />
      )}
      {status.detail && <StatusRow label="Detail" text={status.detail} />}
    </dl>
  );
}
