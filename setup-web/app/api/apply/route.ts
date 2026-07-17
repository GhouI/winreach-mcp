// Apply endpoint — takes the generated setup config and writes it into effect
// on THIS host. It does three things, all under a server-chosen data dir:
//
//   1. writes  data/winreach.env         (dotenv WINREACH_* the host can load)
//   2. writes  data/start-winreach.ps1   (a ready-to-run PowerShell start script)
//   3. persists the config via the shared config store (data/winreach-setup.config.json)
//
// Auth: Authorization: Bearer <WINREACH_SETUP_KEY> (or x-setup-key header) — the
// endpoint is DISABLED until WINREACH_SETUP_KEY is set on the host, so nothing is
// exposed by default. Same-origin + body-cap + rate-limit guards apply.

import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeSetupKey } from "@/lib/setup-key";
import { clientKey, crossOriginError, rateLimit, rateLimited, readJsonCapped } from "@/lib/http-guard";
import { sanitizeConfig } from "@/lib/form-state";
import { writeStoredConfig } from "@/lib/config-store";
import { buildEnvFile, buildEnvVars, buildStartScript } from "@/lib/winreach-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const xo = crossOriginError(req);
  if (xo) return xo;
  if (!rateLimit(`setupkey:${clientKey(req)}`, 30, 5 * 60_000)) return rateLimited();
  const denied = authorizeSetupKey(req);
  if (denied) return denied;

  const parsed = await readJsonCapped(req, 256 * 1024);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body;

  // Accept either a bare config or { config: ... }; unknown fields are dropped
  // and missing ones fall back to defaults (same contract as /api/config).
  const raw =
    body && typeof body === "object" && "config" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).config
      : body;
  const config = sanitizeConfig(raw);

  // The data dir is chosen by the SERVER, never supplied by the client, so a
  // request can't be tricked into writing outside the app's own data folder.
  const dataDir = path.join(process.cwd(), "data");
  const envPath = path.join(dataDir, "winreach.env");
  const scriptPath = path.join(dataDir, "start-winreach.ps1");
  const configPath = path.join(dataDir, "winreach-setup.config.json");

  const envFile = buildEnvFile(config);
  const startScript = buildStartScript(config);
  const envCount = buildEnvVars(config).length + (config.authMode === "users" ? 1 : 0);

  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(envPath, envFile, "utf8");
    await fs.writeFile(scriptPath, startScript, "utf8");
    const saved = await writeStoredConfig(config, "web");

    return NextResponse.json({
      ok: true,
      dataDir,
      wrote: {
        envFile: envPath,
        startScript: scriptPath,
        config: configPath,
      },
      envVarCount: envCount,
      updatedAt: saved.updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not write to the data directory: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
