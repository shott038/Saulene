/**
 * @saulene/plugin — session injection cache
 *
 * The rendered voice is pure in the soul state (same soul → byte-identical injection), so we
 * render once at SessionStart and cache to disk. UserPromptSubmit reads the cache each turn and
 * returns the text as additionalContext alongside the user prompt — the S1 delivery mechanism.
 *
 * File: `<storageRoot>/session-injection.json`
 * Shape: `{ text, soulHash }` — the minimal subset of RenderedInjection the runner needs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RenderedInjection } from "@saulene/renderer";

const CACHE_FILENAME = "session-injection.json";

/** The slim on-disk representation of the rendered injection. */
export interface SessionCacheEntry {
  text: string;
  soulHash: string;
}

/**
 * Write the rendered injection to the session cache. Called by the SessionStart hook so the
 * per-turn UserPromptSubmit hook can reuse it without re-rendering.
 */
export function writeSessionCache(storageRoot: string, injection: RenderedInjection): void {
  const entry: SessionCacheEntry = { text: injection.text, soulHash: injection.soulHash };
  writeFileSync(join(storageRoot, CACHE_FILENAME), JSON.stringify(entry), "utf8");
}

/**
 * Read the session cache. Returns `null` when:
 *   - the file doesn't exist (SessionStart never ran / was dormant)
 *   - the file is malformed
 */
export function readSessionCache(storageRoot: string): SessionCacheEntry | null {
  const file = join(storageRoot, CACHE_FILENAME);
  if (!existsSync(file)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.text !== "string" || typeof obj.soulHash !== "string") return null;
    return { text: obj.text, soulHash: obj.soulHash };
  } catch {
    return null;
  }
}
