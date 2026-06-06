/**
 * @saulene/harness — dev-only LLM client for the REAL judge.
 *
 * WHY THIS LIVES HERE (not reused from the plugin): the boundary graph
 * (see `scripts/check-boundaries.mjs` / `docs/ARCHITECTURE.md`) forbids `harness → plugin`.
 * The plugin owns its own `AnthropicLlmClient` for perception; the harness owns this one for the
 * judge. Both are thin wrappers over the same SDK — duplicated on purpose so neither edge has to
 * import the other. This client satisfies `@saulene/perception`'s `LlmClient` port exactly, so the
 * judge is written against the port, not the SDK.
 *
 * DETERMINISM + COST: temp 0 ⇒ a given prompt maps to a stable response, so every `complete` is
 * memoised to a JSON file on disk (`.judge-cache.json`, gitignored). Calibration re-runs over the
 * same prompts cost ZERO model calls; a half-finished live run resumes from the cache. Delete the
 * cache file to force a fresh, fully-live pass.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "@saulene/perception";

/** The judge model. Haiku, temp 0 — the same "cheap, low-temperature, single call" choice the SPEC names for perception. */
export const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5-20251001";

/** Max tokens per judge response — the judge only ever emits a short JSON array / single token. */
const MAX_TOKENS = 1024;

/** FNV-1a/32 over a string → 8-hex cache key. No clock, no randomness — stable across runs. */
function keyOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export interface AnthropicJudgeClientOpts {
  apiKey?: string;
  model?: string;
  /** Disk cache path. `null` disables caching (every call hits the model). */
  cachePath?: string | null;
}

/**
 * A caching Anthropic client implementing `LlmClient`. Reads `ANTHROPIC_API_KEY` from the
 * environment when no key is supplied. Throws on a non-text response (the judge prompts always
 * ask for text).
 */
export class AnthropicJudgeClient implements LlmClient {
  private readonly client: Anthropic;
  readonly model: string;
  private readonly cachePath: string | null;
  private cache: Record<string, string>;
  /** Live model calls made this process (cache misses) — surfaced by the live runner for cost visibility. */
  calls = 0;
  /** Cache hits this process. */
  hits = 0;

  constructor(opts: AnthropicJudgeClientOpts = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = opts.model ?? DEFAULT_JUDGE_MODEL;
    this.cachePath = opts.cachePath === undefined ? ".judge-cache.json" : opts.cachePath;
    this.cache =
      this.cachePath && existsSync(this.cachePath)
        ? (JSON.parse(readFileSync(this.cachePath, "utf8")) as Record<string, string>)
        : {};
  }

  private persist(): void {
    if (!this.cachePath) return;
    const dir = dirname(this.cachePath);
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }

  async complete(prompt: string): Promise<string> {
    const k = `${this.model}:${keyOf(prompt)}`;
    const cached = this.cache[k];
    if (cached !== undefined) {
      this.hits++;
      return cached;
    }
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(`AnthropicJudgeClient: unexpected non-text response from ${this.model}`);
    }
    this.calls++;
    this.cache[k] = block.text;
    this.persist();
    return block.text;
  }
}
