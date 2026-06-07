/**
 * @saulene/life-sim — LLM backends
 *
 * Mirrors the ClaudeCliClient + JudgeCache pattern from tools/harness/src/llm.ts.
 * Duplicated here because the boundary graph forbids life-sim → harness.
 * Both satisfy the @saulene/perception LlmClient port.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LlmClient } from "@saulene/perception";

// ── FNV-1a cache key ────────────────────────────────────────────────────────

function keyOf(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// ── Disk cache ───────────────────────────────────────────────────────────────

export class LifeSimCache {
  hits = 0;
  private readonly path: string | null;
  private store: Record<string, string>;

  constructor(path: string | null = ".life-sim-cache.json") {
    this.path = path;
    this.store =
      path && existsSync(path)
        ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>)
        : {};
  }

  lookup(model: string, prompt: string): string | undefined {
    const hit = this.store[`${model}:${keyOf(prompt)}`];
    if (hit !== undefined) this.hits++;
    return hit;
  }

  save(model: string, prompt: string, value: string): void {
    this.store[`${model}:${keyOf(prompt)}`] = value;
    if (!this.path) return;
    const dir = dirname(this.path);
    if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.store, null, 2));
  }
}

// ── ClaudeCliClient ──────────────────────────────────────────────────────────

export interface ClaudeCliClientOpts {
  bin?: string;
  model?: string;
  cachePath?: string | null;
  systemPrompt?: string;
}

const DEFAULT_SYSTEM = "You are a helpful assistant. Output only exactly what is asked.";

/**
 * Subscription backend: spawn `claude -p` headlessly, no API key.
 * Injected as the LlmClient for both the synthetic user and the ul voice.
 */
export class ClaudeCliClient implements LlmClient {
  readonly model: string;
  private readonly bin: string;
  private readonly cache: LifeSimCache;
  private readonly systemPrompt: string;
  calls = 0;

  constructor(opts: ClaudeCliClientOpts = {}) {
    this.bin = opts.bin ?? process.env.SAULENE_CLAUDE_BIN ?? "claude";
    this.model = opts.model ?? "haiku";
    this.systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM;
    this.cache = new LifeSimCache(
      opts.cachePath === undefined ? ".life-sim-cache.json" : opts.cachePath,
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
        [
          "-p",
          "--model",
          this.model,
          "--allowedTools",
          "",
          "--strict-mcp-config",
          "--system-prompt",
          this.systemPrompt,
        ],
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
