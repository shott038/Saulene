import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Workspace package aliases — vitest runs from the repo root where pnpm does not
// place @saulene/* in the root node_modules (they live in each package's own
// node_modules). Aliases point vitest at the compiled dist outputs directly.
const pkg = (name: string): string =>
  resolve(__dirname, "packages", name, "dist", "index.js");
const tool = (name: string): string =>
  resolve(__dirname, "tools", name, "dist", "index.js");

export default defineConfig({
  resolve: {
    alias: {
      "@saulene/core": pkg("core"),
      "@saulene/storage": pkg("storage"),
      "@saulene/renderer": pkg("renderer"),
      "@saulene/perception": pkg("perception"),
      "@saulene/plugin": pkg("plugin"),
      "@saulene/simulator": tool("simulator"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
