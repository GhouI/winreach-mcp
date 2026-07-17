"use client";

import { useState } from "react";
import { Section, btnPrimary } from "@/components/ui";
import { DraftEditor } from "./draft-editor";
import { emptyDraft, draftToBody, type ApiUser, type Draft } from "./types";

/** Create a new account. A random key is generated server-side and shown once. */
export function CreatePanel({
  onCreated,
  onError,
}: {
  onCreated: (user: ApiUser, token: string) => void;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!draft.name.trim()) {
      onError("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftToBody(draft)),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        onError(data?.error ?? `Create failed (${res.status}).`);
        return;
      }
      onCreated(data.user as ApiUser, data.token as string);
      setDraft(emptyDraft());
    } catch {
      onError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Create account" desc="A random key is generated on the server and shown once.">
      <DraftEditor draft={draft} onChange={setDraft} />
      <button type="button" disabled={busy} onClick={create} className={btnPrimary}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </Section>
  );
}
