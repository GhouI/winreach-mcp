"use client";

// Dashboard panel for the /api/config host document: save the current
// configuration to this host, or load the saved one back into the editor.
// Gated by WINREACH_SETUP_KEY (bearer), same as always.

import { useState } from "react";
import type { WinReachConfig } from "@/lib/winreach-config";
import { fromConfig, sanitizeConfig, type FormState } from "@/lib/form-state";
import type { StoredConfig } from "@/lib/config-store";
import { Field, Section, StatusMsg, TextInput, btnPrimary, btnSecondary } from "@/components/ui";

export function AgentAccessPanel({
  cfg,
  onLoaded,
}: {
  cfg: WinReachConfig;
  onLoaded: (form: FormState) => void;
}) {
  const [setupKey, setSetupKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const call = async (method: "GET" | "PUT") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/config", {
        method,
        headers: {
          authorization: `Bearer ${setupKey.trim()}`,
          ...(method === "PUT"
            ? { "content-type": "application/json", "x-updated-by": "web" }
            : {}),
        },
        body: method === "PUT" ? JSON.stringify({ config: cfg }) : undefined,
      });
      const data = (await res.json().catch(() => null)) as
        | (Partial<StoredConfig> & { error?: string })
        | null;
      if (!res.ok) {
        setMsg({ tone: "err", text: data?.error ?? `Request failed (${res.status}).` });
        return;
      }
      if (method === "GET") {
        onLoaded(fromConfig(sanitizeConfig(data?.config)));
        const when = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : "unknown time";
        setMsg({
          tone: "ok",
          text: `Loaded the saved configuration (last updated ${when} by ${data?.updatedBy ?? "unknown"}).`,
        });
      } else {
        setMsg({
          tone: "ok",
          text: "Configuration saved on this host. Agents with the setup key can now read and modify it.",
        });
      }
    } catch {
      setMsg({ tone: "err", text: "Could not reach the setup API on this host." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Agent access"
      desc="Save this configuration on the host so agents holding the setup key can read and modify it over HTTP."
    >
      <div className="overflow-x-auto rounded-md border border-code-border bg-code p-3.5 font-mono text-xs leading-6 text-code-muted code-scroll">
        <p><span className="text-code-accent">GET</span>&nbsp;&nbsp;/api/config</p>
        <p><span className="text-code-accent">PUT</span>&nbsp;&nbsp;/api/config</p>
        <p>Authorization: Bearer &lt;WINREACH_SETUP_KEY&gt;</p>
      </div>
      <p className="max-w-prose text-xs leading-relaxed text-muted">
        The endpoint stays disabled until the <code className="font-mono">WINREACH_SETUP_KEY</code>{" "}
        environment variable is set on the host running this app. Enter the same key below to
        save or load the shared configuration.
      </p>
      <Field label="Setup key" hint="Must match WINREACH_SETUP_KEY on this host.">
        <TextInput value={setupKey} onChange={setSetupKey} placeholder="paste your setup key" mono />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !setupKey.trim()}
          onClick={() => call("PUT")}
          className={btnPrimary}
        >
          Save to host
        </button>
        <button
          type="button"
          disabled={busy || !setupKey.trim()}
          onClick={() => call("GET")}
          className={btnSecondary}
        >
          Load saved config
        </button>
        {busy && <span className="text-xs text-muted">Working…</span>}
      </div>
      {msg && <StatusMsg tone={msg.tone}>{msg.text}</StatusMsg>}
    </Section>
  );
}
