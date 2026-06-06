/**
 * @saulene/harness — dev-only LLM clients for the REAL judge.
 *
 * WHY THESE LIVE HERE (not reused from the plugin): the boundary graph
 * (see `scripts/check-boundaries.mjs` / `docs/ARCHITECTURE.md`) forbids `harness → plugin`.
 * The plugin owns its own `AnthropicLlmClient` for perception; the harness owns these for the
 * judge. Both satisfy `@saulene/perception`'s `LlmClient` port, so the judge is written against the
 * port, not the backend.
 *
 * TWO BACKENDS, same port + same cache (`.judge-cache.json`, gitignored):
 *   • {@link AnthropicJudgeClient} — the Anthropic SDK. Needs `ANTHROPIC_API_KEY` (billed).
 *   • {@link ClaudeCliClient}      — shells out to the local `claude -p` binary, using this
 *     machine's Claude Code SUBSCRIPTION auth (no API key, no per-call billing). Slower per call.
 */

import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "@saulene/perception";
import { JudgeCache } from "./cache.js";

/** The judge model. Haiku, temp 0 — the SPEC's "cheap, low-temperature, single call" choice. */
export const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5-20251001";

/** A terse system prompt shared by both backends — keep the judge from chatting. */
const JUDGE_SYSTEM = "You are a terse evaluator. Output only exactly what is asked, nothing else.";

/** Max tokens per judge response — the judge only ever emits a short JSON array / single token. */
const MAX_TOKENS = 1024;

export interface AnthropicJudgeClientOpts {
  apiKey?: string;
  model?: string;
  /** Disk cache path. `null` disables caching (every call hits the model). */
  cachePath?: string | null;
}

/**
 * SDK backend. Reads `ANTHROPIC_API_KEY` from the environment when no key is supplied. Throws on a
 * non-text response (the judge prompts always ask for text).
 */
export class AnthropicJudgeClient implements LlmClient {
  private readonly client: Anthropic;
  readonly model: string;
  private readonly cache: JudgeCache;
  /** Live model calls made this process (cache misses) — surfaced for cost visibility. */
  calls = 0;

  constructor(opts: AnthropicJudgeClientOpts = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = opts.model ?? DEFAULT_JUDGE_MODEL;
    this.cache = new JudgeCache(
      opts.cachePath === undefined ? ".judge-cache.json" : opts.cachePath,
    );
  }

  /** Cache hits this process. */
  get hits(): number {
    return this.cache.hits;
  }

  async complete(prompt: string): Promise<string> {
    const cached = this.cache.lookup(this.model, prompt);
    if (cached !== undefined) return cached;
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: JUDGE_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(`AnthropicJudgeClient: unexpected non-text response from ${this.model}`);
    }
    this.calls++;
    const text = block.text;
    this.cache.save(this.model, prompt, text);
    return text;
  }
}

export interface ClaudeCliClientOpts {
  /** `claude` binary. Defaults to `$SAULENE_CLAUDE_BIN` then `claude` (resolved from PATH, no shell). */
  bin?: string;
  /** Model alias passed to `--model` (CLI accepts short aliases like `haiku`). Default `haiku`. */
  model?: string;
  cachePath?: string | null;
}

/**
 * Subscription backend: spawn `claude -p` headlessly (prompt on stdin), tools stripped, terse
 * system prompt. Uses this machine's Claude Code auth — no API key, no per-call billing. Spawned
 * via the binary directly (NOT a shell), so the user's interactive `claude` shell function (which
 * injects `/color`) never runs. Slower per call (~5s) than the SDK; same port + cache.
 */
export class ClaudeCliClient implements LlmClient {
  readonly model: string;
  private readonly bin: string;
  private readonly cache: JudgeCache;
  calls = 0;

  constructor(opts: ClaudeCliClientOpts = {}) {
    this.bin = opts.bin ?? process.env.SAULENE_CLAUDE_BIN ?? "claude";
    this.model = opts.model ?? "haiku";
    this.cache = new JudgeCache(
      opts.cachePath === undefined ? ".judge-cache.json" : opts.cachePath,
    );
  }

  get hits(): number {
    return this.cache.hits;
  }

  async complete(prompt: string): Promise<string> {
    const cached = this.cache.lookup(this.model, prompt);
    if (cached !== undefined) return cached;
    const text = await this.spawnOnce(prompt);
    this.calls++;
    this.cache.save(this.model, prompt, text);
    return text;
  }

  private spawnOnce(prompt: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        this.bin,
        ["-p", "--model", this.model, "--allowedTools", "", "--system-prompt", JUDGE_SYSTEM],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => {
        out += d;
      });
      child.stderr.on("data", (d) => {
        err += d;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve(out.trim());
        else reject(new Error(`claude -p exited ${code}: ${err.trim() || out.trim()}`));
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
