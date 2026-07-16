import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

// This app lives inside the winbridge-mcp repo, which has its own lockfile.
// Pin Turbopack's workspace root to this directory so Next doesn't infer the
// parent repo as the root.
const nextConfig: NextConfig = {
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
