/**
 * @saulene/harness — shared on-disk memo for judge LLM calls.
 *
 * Both judge backends (the SDK `AnthropicJudgeClient` and the subscription `ClaudeCliClient`) write
 * to the SAME cache, keyed by `model:hash(prompt)`. temp 0 ⇒ a prompt maps to a stable response, so
 * a run is resumable and calibration re-runs cost zero calls. Delete the cache file to force fresh.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** FNV-1a/32 over a string → 8-hex key. No clock, no randomness — stable across runs. */
export function keyOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Disk-backed prompt→response memo. `path: null` disables persistence (every call is a miss). */
export class JudgeCache {
  /** Cache hits this process. */
  hits = 0;
  private readonly path: string | null;
  private store: Record<string, string>;

  constructor(path: string | null = ".judge-cache.json") {
    this.path = path;
    this.store =
      path && existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>)
        : {};
  }

  /** Cached response for (model, prompt), or undefined on a miss. Counts hits. */
  lookup(model: string, prompt: string): string | undefined {
    const hit = this.store[`${model}:${keyOf(prompt)}`];
    if (hit !== undefined) this.hits++;
    return hit;
  }

  /** Persist a fresh response for (model, prompt). */
  save(model: string, prompt: string, value: string): void {
    this.store[`${model}:${keyOf(prompt)}`] = value;
    if (!this.path) return;
    const dir = dirname(this.path);
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.store, null, 2));
  }
}
