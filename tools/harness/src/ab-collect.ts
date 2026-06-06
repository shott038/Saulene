/**
 * @saulene/harness — A/B response collector (Phase 2, subscription-only, dev-only).
 *
 * Reproduces the plugin's ONLY behavioral mechanism without the install plumbing: prepend
 * `render(soul).text` to the system prompt via `claude -p --append-system-prompt` (the faithful
 * SessionStart-hook analog). Two arms, identical except the injection:
 *   • Arm A (treatment): `claude -p "<prompt>" --append-system-prompt "<render(soul).text>"`
 *   • Arm B (control):   `claude -p "<prompt>"` (no injection) — soul-independent, collected once.
 *
 * SUBSCRIPTION-ONLY: `ANTHROPIC_API_KEY` is stripped from the subprocess env so the CLI uses the
 * logged-in Claude Code subscription, never metered billing. Tools disabled for clean answers.
 * Responses cache to disk (`.ab-cache.json`, gitignored) so re-runs cost zero quota.
 */

import { spawn } from "node:child_process";
import { JudgeCache } from "./cache.js";

/** Default model for the ARMS (the model under test). Override via `AB_ARM_MODEL`. Sonnet = quota-friendly + capable. */
export const DEFAULT_ARM_MODEL = "sonnet";

export interface CollectOpts {
  /** The battery prompt (user turn). */
  userPrompt: string;
  /** Injection appended to the system prompt (Arm A). Empty/undefined = control (Arm B). */
  systemAppend?: string;
  /** Sample index — distinct samples of the same prompt give the variance for the CI. */
  sample: number;
  /** Arm label, for the cache key + clarity ("A" | "B"). */
  arm: string;
}

/** One `claude -p` envelope field we read; the rest is ignored. */
interface CliResult {
  result?: string;
  is_error?: boolean;
}

/**
 * Collects model responses for the two arms by shelling out to the local `claude` CLI. Same disk-memo
 * pattern as the judge cache; keyed by (arm, model, sample, system+prompt) so each cell is resumable.
 */
export class ResponseCollector {
  readonly model: string;
  private readonly bin: string;
  private readonly cache: JudgeCache;
  /** Live model calls this process (cache misses). */
  calls = 0;

  constructor(opts: { bin?: string; model?: string; cachePath?: string | null } = {}) {
    this.bin = opts.bin ?? process.env.SAULENE_CLAUDE_BIN ?? "claude";
    this.model = opts.model ?? process.env.AB_ARM_MODEL ?? DEFAULT_ARM_MODEL;
    this.cache = new JudgeCache(opts.cachePath === undefined ? ".ab-cache.json" : opts.cachePath);
  }

  get hits(): number {
    return this.cache.hits;
  }

  async collect(o: CollectOpts): Promise<string> {
    const sys = o.systemAppend ?? "";
    // Cache key folds arm + sample into the "model" slot and system+prompt into the "prompt" slot.
    const keyModel = `${o.arm}:${this.model}:s${o.sample}`;
    const keyPrompt = `${sys}\n<<>>\n${o.userPrompt}`;
    const cached = this.cache.lookup(keyModel, keyPrompt);
    if (cached !== undefined) return cached;
    const text = await this.spawnOnce(o.userPrompt, sys);
    this.calls++;
    this.cache.save(keyModel, keyPrompt, text);
    return text;
  }

  private spawnOnce(userPrompt: string, systemAppend: string): Promise<string> {
    const args = ["-p", "--output-format", "json", "--allowedTools", "", "--model", this.model];
    if (systemAppend) args.push("--append-system-prompt", systemAppend);
    // Strip the metered key so the CLI uses subscription auth (omit it entirely, not set undefined).
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== "ANTHROPIC_API_KEY"),
    );

    return new Promise<string>((resolve, reject) => {
      const child = spawn(this.bin, args, { stdio: ["pipe", "pipe", "pipe"], env });
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
        if (code !== 0) {
          reject(new Error(`claude -p exited ${code}: ${err.trim() || out.trim()}`));
          return;
        }
        try {
          const parsed = JSON.parse(out) as CliResult;
          if (parsed.is_error || typeof parsed.result !== "string") {
            reject(new Error(`claude -p returned an error envelope: ${out.slice(0, 300)}`));
            return;
          }
          resolve(parsed.result);
        } catch (e) {
          reject(
            new Error(
              `claude -p: unparseable JSON (${(e as Error).message}): ${out.slice(0, 300)}`,
            ),
          );
        }
      });
      child.stdin.write(userPrompt);
      child.stdin.end();
    });
  }
}
