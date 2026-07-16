// Server-only persistence for the saved WinBridge setup config.
// Stored as JSON next to the app (this app runs on the Windows host itself),
// so agents with the setup key and the local operator see the same document.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { WinBridgeConfig } from "@/lib/winbridge-config";

export type StoredConfig = {
  config: WinBridgeConfig;
  updatedAt: string; // ISO timestamp
  updatedBy: "web" | "agent";
};

function storePath(): string {
  return path.join(process.cwd(), "data", "winbridge-setup.config.json");
}

export async function readStoredConfig(): Promise<StoredConfig | null> {
  try {
    const raw = await fs.readFile(storePath(), "utf8");
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return null;
  }
}

export async function writeStoredConfig(
  config: WinBridgeConfig,
  updatedBy: StoredConfig["updatedBy"],
): Promise<StoredConfig> {
  const doc: StoredConfig = {
    config,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return doc;
}
