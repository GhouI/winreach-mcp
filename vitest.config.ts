import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 20000,
    // Only run the TypeScript sources under test/, never compiled copies in dist/.
    include: ["test/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"]
  }
});
