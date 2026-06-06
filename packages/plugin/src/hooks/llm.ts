/**
 * @saulene/plugin — real LLM client (the Anthropic SDK port implementation)
 *
 * Implements the `LlmClient` interface that `@saulene/perception` depends on, using the
 * Anthropic SDK. The plugin is the ONLY place that touches a real model SDK — perception
 * itself is pure (injected interface), so it remains testable with a fake.
 *
 * SPEC: "cheap small model, low temperature, single call" — Haiku is the right production
 * choice for perception (fast, cheap, reliable for structured extraction).
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient } from "@saulene/perception";

/** The default model for perception — cheap, fast, low temperature for structured extraction. */
export const DEFAULT_PERCEPTION_MODEL = "claude-haiku-4-5-20251001";

/** Maximum tokens for the perception response (one structured JSON object). */
const MAX_TOKENS = 2048;

/**
 * The real LLM client: a thin wrapper over the Anthropic SDK that satisfies `LlmClient`.
 * Reads `ANTHROPIC_API_KEY` from the environment when no key is supplied — the standard
 * Claude Code session environment has this set.
 */
export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;
  /** The model used for every `complete` call. Exposed so the caller can log/stamp it. */
  readonly model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({
      apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    this.model = opts.model ?? DEFAULT_PERCEPTION_MODEL;
  }

  /** Send one prompt, return the raw text response. Throws on SDK/network error. */
  async complete(prompt: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      temperature: 0, // low temperature for deterministic structured extraction (SPEC)
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (!block || block.type !== "text") {
      throw new Error(`AnthropicLlmClient: unexpected non-text response from model ${this.model}`);
    }
    return block.text;
  }
}
