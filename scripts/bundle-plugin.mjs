#!/usr/bin/env node
/**
 * bundle-plugin.mjs — produce self-contained, dependency-free dist artifacts for
 * the Saulene Claude Code plugin.
 *
 * Claude Code clones a plugin repo and runs its files AS-IS: no `npm install`, no
 * build step, no pnpm workspace symlinks. So every shipped entrypoint must be a
 * single .js file that runs with bare `node file.js` and NO `node_modules` present.
 *
 * We bundle each SHIPPED entrypoint with esbuild, INLINING all workspace packages
 * (@saulene/core, perception, renderer, storage) and npm deps (@anthropic-ai/sdk,
 * @modelcontextprotocol/sdk). Node builtins stay external.
 *
 * Output paths MUST match exactly what the manifests reference:
 *   - hooks/hooks.json   -> dist/bin/hook-{session-start,stop,user-prompt-submit}.js
 *   - skills SKILL.md    -> dist/bin/{setup,skill-ul}.js
 *   - .mcp.json          -> dist/mcp/bin.js
 *
 * Run: pnpm --filter @saulene/plugin bundle   (cwd = packages/plugin)
 */

import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(__dirname, "..", "packages", "plugin");
const srcRoot = resolve(pluginRoot, "src");
const distRoot = resolve(pluginRoot, "dist");

/** Each shipped entrypoint: source under src/, output under dist/ (mirrored path). */
const ENTRYPOINTS = [
  { in: "bin/hook-session-start.ts", out: "bin/hook-session-start.js" },
  { in: "bin/hook-stop.ts", out: "bin/hook-stop.js" },
  { in: "bin/hook-user-prompt-submit.ts", out: "bin/hook-user-prompt-submit.js" },
  { in: "bin/setup.ts", out: "bin/setup.js" },
  { in: "bin/skill-ul.ts", out: "bin/skill-ul.js" },
  { in: "bin/statusline.ts", out: "bin/statusline.js" },
  { in: "bin/enable-statusline.ts", out: "bin/enable-statusline.js" },
  { in: "mcp/bin.ts", out: "mcp/bin.js" },
];

// Start clean so stale artifacts never ship.
rmSync(distRoot, { recursive: true, force: true });

const result = await esbuild.build({
  entryPoints: ENTRYPOINTS.map((e) => ({
    in: resolve(srcRoot, e.in),
    out: e.out.replace(/\.js$/, ""), // esbuild appends .js per outExtension
  })),
  outdir: distRoot,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // Inline EVERYTHING (workspace + npm deps); only node builtins stay external.
  // esbuild 0.21's default with bundle:true is to inline all resolvable imports
  // (node builtins stay external on platform=node) — equivalent to --packages=bundle.
  // ESM bundles that use __dirname/require interop need these shims defined.
  banner: {
    js: [
      "import { createRequire as __saulene_createRequire } from 'node:module';",
      "import { fileURLToPath as __saulene_fileURLToPath } from 'node:url';",
      "import { dirname as __saulene_dirname } from 'node:path';",
      "const require = __saulene_createRequire(import.meta.url);",
      "const __filename = __saulene_fileURLToPath(import.meta.url);",
      "const __dirname = __saulene_dirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
  metafile: true,
});

const outputs = Object.keys(result.metafile.outputs).sort();
console.log(`\n✓ bundled ${ENTRYPOINTS.length} entrypoints -> packages/plugin/dist`);
for (const o of outputs) {
  if (o.endsWith(".js")) console.log(`  ${o}`);
}
