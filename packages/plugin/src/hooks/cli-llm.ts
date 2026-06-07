/**
 * @saulene/plugin — CLI-based LLM client for drift perception
 *
 * Implements `LlmClient` by shelling out to `claude -p` using the user's existing Claude Code
 * login — no `ANTHROPIC_API_KEY` required. The child inherits the user's subscription auth.
 *
 * RECURSION GUARD (belt): sets `SAULENE_PERCEPTION=1` on every spawned child so that the
 * plugin's own hooks no-op immediately inside the perception subprocess (see bin/guard.ts).
 * Without this guard, the Stop hook would re-fire inside the child and fork-bomb.
 *
 * RECURSION GUARD (suspenders): `--bare` skips all hooks and plugins in the child session,
 * so even if the env sentinel were somehow missed, the hooks never run. Claude Code 2.1.168+
 * supports this flag. Use both layers for defense-in-depth.
 *
 * `--output-format json` is used so the response arrives in a structured envelope; the
 * `result` field carries the model's text (the perception JSON). `--allowedTools ""` strips
 * all tools (pure extraction call). `--strict-mcp-config` prevents extra MCP servers from
 * booting per call (CPU saver).
 *
 * The spawn function is injected via the constructor so tests can fake it without spawning
 * any real processes. The default spawn writes the prompt on stdin and resolves with the
 * trimmed stdout (the JSON envelope).
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { LlmClient } from "@saulene/perception";

/** The default model for perception — cheap, fast, deterministic extraction. */
export const DEFAULT_PERCEPTION_MODEL = "claude-haiku-4-5-20251001";

/**
 * Injectable spawn function: receives the binary path, CLI args, the prompt (written to
 * stdin), and the child's environment. Returns a promise resolving to the raw stdout string.
 * The default implementation wraps Node's `child_process.spawn`.
 */
export type SpawnFn = (
  bin: string,
  args: string[],
  input: string,
  env: NodeJS.ProcessEnv,
) => Promise<string>;

export interface ClaudeCliClientOpts {
  /** `claude` binary. Defaults to `$SAULENE_CLAUDE_BIN` then `claude` (resolved from PATH). */
  bin?: string;
  /** Model alias passed to `--model`. Defaults to `claude-haiku-4-5-20251001`. */
  model?: string;
  /**
   * Injectable spawn function. Defaults to the real `child_process.spawn` wrapper.
   * Pass a fake in tests so no real `claude -p` process is spawned.
   */
  spawnFn?: SpawnFn;
}

/**
 * LLM client that drives drift perception via `claude -p` (subscription auth, no API key).
 * The child process gets `SAULENE_PERCEPTION=1` so the plugin's own hooks are suppressed.
 */
export class ClaudeCliClient implements LlmClient {
  private readonly bin: string;
  readonly model: string;
  private readonly spawnFn: SpawnFn;

  constructor(opts: ClaudeCliClientOpts = {}) {
    this.bin = opts.bin ?? process.env.SAULENE_CLAUDE_BIN ?? "claude";
    this.model = opts.model ?? DEFAULT_PERCEPTION_MODEL;
    this.spawnFn = opts.spawnFn ?? defaultSpawn;
  }

  async complete(prompt: string): Promise<string> {
    const raw = await this.spawnFn(
      this.bin,
      [
        "-p",
        "--model",
        this.model,
        "--allowedTools",
        "",
        "--output-format",
        "json",
        "--strict-mcp-config",
        "--bare",
      ],
      prompt,
      { ...process.env, SAULENE_PERCEPTION: "1" },
    );

    let env: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new SyntaxError("not an object");
      }
      env = parsed as Record<string, unknown>;
    } catch {
      throw new Error(
        `ClaudeCliClient: invalid JSON envelope from claude -p: ${raw.slice(0, 200)}`,
      );
    }

    if (typeof env.result !== "string") {
      throw new Error(
        `ClaudeCliClient: missing 'result' field in claude -p envelope: ${JSON.stringify(env).slice(0, 200)}`,
      );
    }

    if (env.is_error === true) {
      throw new Error(`ClaudeCliClient: claude -p reported error: ${env.result}`);
    }

    return env.result;
  }
}

function defaultSpawn(
  bin: string,
  args: string[],
  input: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = nodeSpawn(bin, args, { stdio: ["pipe", "pipe", "pipe"], env });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d;
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d;
    });
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude -p exited ${String(code)}: ${err.trim() || out.trim()}`));
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}
