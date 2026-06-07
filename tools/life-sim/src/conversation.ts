/**
 * @saulene/life-sim — conversation runner
 *
 * Drives a multi-turn synthetic user ↔ ul exchange.
 * The ul's voice is produced by calling the injected LlmClient with render(soul).text
 * prepended as a voice injection — mirroring the plugin's S1 injection.
 * Output: a plain-text transcript that perceive() accepts.
 */

import type { Soul } from "@saulene/core";
import type { LlmClient } from "@saulene/perception";
import { render } from "@saulene/renderer";
import type { SyntheticUser } from "./synthetic-user.js";

export interface ConversationOpts {
  /** Number of user turns (2–4). Ul always responds once per user turn. */
  turns?: number;
  /** Session index — passed to SyntheticUser for arc calculation. */
  sessionIndex?: number;
}

export interface Transcript {
  /** Plain-text turn-by-turn format parseable by perceive(). */
  text: string;
  /** Soul hash of the ul at conversation time — for corpus meta. */
  soulHash: string;
}

/** Format a single exchange for the transcript. */
function formatExchange(userMsg: string, ulReply: string): string {
  return `User: ${userMsg}\nAssistant: ${ulReply}`;
}

/**
 * Run a multi-turn conversation between a SyntheticUser and the ul.
 * The ul uses render(soul).text as its voice system prompt.
 * Returns a transcript string + soul hash.
 */
export async function runConversation(
  syntheticUser: SyntheticUser,
  soul: Soul,
  ulLlm: LlmClient,
  opts: ConversationOpts = {},
): Promise<Transcript> {
  const turns = opts.turns ?? 3;
  const sessionIndex = opts.sessionIndex ?? 0;

  const rendered = render(soul);
  const voiceText = rendered.text;
  const soulHash = rendered.soulHash;

  const history: Array<{ role: "user" | "assistant"; text: string }> = [];
  const exchanges: string[] = [];

  for (let i = 0; i < turns; i++) {
    // User turn
    const userMsg = await syntheticUser.turn({
      turnIndex: i,
      totalTurns: turns,
      sessionIndex,
      history,
    });
    history.push({ role: "user", text: userMsg });

    // Ul turn — voice-injected
    const historyForUl = history
      .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
      .join("\n");
    const ulPrompt = `${voiceText}

${historyForUl}`;

    const ulReply = await ulLlm.complete(ulPrompt);
    history.push({ role: "assistant", text: ulReply });

    exchanges.push(formatExchange(userMsg, ulReply));
  }

  return {
    text: exchanges.join("\n"),
    soulHash,
  };
}
