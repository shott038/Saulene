#!/usr/bin/env node
/**
 * Boundary guard — the anti-god-file enforcement.
 *
 * This script is the single source of truth for the allowed dependency graph
 * (see docs/ARCHITECTURE.md). It fails CI if any package:
 *   (a) imports a sibling @saulene/* package not permitted by the graph, or
 *   (b) imports a sibling it didn't declare in its package.json dependencies, or
 *   (c) declares a dependency the graph doesn't allow.
 *
 * tsc project references don't enforce this (pnpm symlinks make wrong-direction
 * imports resolve anyway), so we check it ourselves — deterministically, no resolver.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The contract. package short-name → set of @saulene packages it MAY depend on. */
const ALLOWED = {
  core: [],
  renderer: ["core"],
  perception: ["core"],
  storage: ["core"],
  plugin: ["core", "renderer", "perception", "storage"],
  simulator: ["core", "renderer", "perception"],
  harness: ["core", "renderer", "perception", "simulator"],
};

const PKG_DIRS = [
  ["core", "packages/core"],
  ["renderer", "packages/renderer"],
  ["perception", "packages/perception"],
  ["storage", "packages/storage"],
  ["plugin", "packages/plugin"],
  ["simulator", "tools/simulator"],
  ["harness", "tools/harness"],
];

const short = (name) => name.replace(/^@saulene\//, "");

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

const IMPORT_RE = /\b(?:from|import)\s+["'](@saulene\/[a-z]+)/g;
const violations = [];

for (const [name, rel] of PKG_DIRS) {
  const allowed = new Set(ALLOWED[name]);
  const pkgDir = join(ROOT, rel);

  // (c) declared deps must be within the allowed graph
  const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const declared = Object.keys(pkgJson.dependencies ?? {})
    .filter((d) => d.startsWith("@saulene/"))
    .map(short);
  for (const d of declared) {
    if (!allowed.has(d)) {
      violations.push(`${name}: declares @saulene/${d} but the graph forbids it`);
    }
  }
  const declaredSet = new Set(declared);

  // (a)+(b) scan actual imports
  for (const file of walk(join(pkgDir, "src"))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const dep = short(m[1]);
      if (dep === name) continue;
      const where = file.replace(ROOT + "/", "");
      if (!allowed.has(dep)) {
        violations.push(`${where}: imports @saulene/${dep} — FORBIDDEN by the graph`);
      } else if (!declaredSet.has(dep)) {
        violations.push(`${where}: imports @saulene/${dep} but it isn't in package.json deps`);
      }
    }
  }
}

if (violations.length) {
  console.error("✗ boundary violations (see docs/ARCHITECTURE.md):\n");
  for (const v of violations) console.error("  - " + v);
  console.error(`\n${violations.length} violation(s).`);
  process.exit(1);
}
console.log("✓ boundaries clean — dependency graph holds.");
