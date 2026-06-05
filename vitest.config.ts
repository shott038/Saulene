import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
    // No tests yet (Phase 1 adds them); don't fail the gate on an empty suite.
    passWithNoTests: true,
  },
});
