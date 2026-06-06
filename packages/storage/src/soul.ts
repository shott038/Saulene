/**
 * @saulene/storage — soul persistence (atomic save, fail-loud load)
 *
 * `saveSoul` writes `<root>/soul.json` ATOMICALLY: serialize to a sibling temp file,
 * fsync-free `rename` over the target. `rename(2)` is atomic on POSIX, so a crash
 * mid-write leaves either the old good soul or the new good soul — never a half-written
 * one. The serialization is CANONICAL (fixed key order) so a round-tripped soul is
 * byte-for-byte identical.
 *
 * `loadSoul` distinguishes the two failure modes the mission demands:
 *   - file ABSENT  → `null`  (a clean "no soul yet" — first run, pre-birth)
 *   - file PRESENT but bad JSON / failing validation → throw `StorageError` (LOUD)
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ASPECTS, type AspectVector, type Soul } from "@saulene/core";
import { soulPath } from "./paths.js";
import { STORAGE_SCHEMA_VERSION, type SoulFile, SoulFileSchema, StorageError } from "./schemas.js";

/** Rebuild an aspect vector in canonical ASPECTS order (stable bytes across round-trips). */
function orderedVector(vec: AspectVector): AspectVector {
  const out = {} as AspectVector;
  for (const a of ASPECTS) out[a] = vec[a];
  return out;
}

/** Canonicalize a soul into a fixed field/key order so serialization is byte-stable. */
function canonicalFile(soul: Soul): SoulFile {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    soul: {
      v: orderedVector(soul.v),
      s: orderedVector(soul.s),
      a: orderedVector(soul.a),
      tension: orderedVector(soul.tension),
      disuseAnchor: orderedVector(soul.disuseAnchor),
      refractory: orderedVector(soul.refractory),
      betaGain: orderedVector(soul.betaGain),
      migrationBudget: soul.migrationBudget,
      stubbornness: soul.stubbornness,
      sex: soul.sex,
      mp: soul.mp,
      lastUsedAt: soul.lastUsedAt,
    },
  };
}

/**
 * Persist the one global soul atomically to `<root>/soul.json`.
 * Validates before writing (defensive: never persist a soul that wouldn't load back),
 * then write-temp-then-rename so a crash can't corrupt a previously-good soul.
 */
export function saveSoul(root: string, soul: Soul): void {
  const file = canonicalFile(soul);
  // Defensive: a soul that can't validate must never reach disk.
  SoulFileSchema.parse(file);

  const target = soulPath(root);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  renameSync(tmp, target); // atomic on POSIX — the corruption-proof swap
}

/**
 * Load the global soul from `<root>/soul.json`.
 * @returns the validated `Soul`, or `null` if no soul file exists yet.
 * @throws  {StorageError} if the file exists but is unparseable or fails validation.
 */
export function loadSoul(root: string): Soul | null {
  const target = soulPath(root);

  let raw: string;
  try {
    raw = readFileSync(target, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null; // clean "no soul yet"
    throw err;
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new StorageError(`soul.json at ${target} is not valid JSON`, err);
  }

  const result = SoulFileSchema.safeParse(json);
  if (!result.success) {
    throw new StorageError(`soul.json at ${target} failed schema validation`, result.error);
  }
  return result.data.soul as Soul;
}
