/**
 * @saulene/harness — forced-choice (2AFC) discriminability judge. Dev-only.
 *
 * Given the two souls' responses to the SAME request plus a behavioral description of each, the
 * blind judge maps responses → descriptions. Slot order is randomized (caller passes `swap`) so the
 * answer can't be positional. Chance = 0.5. Used by the max-contrast diagnostic.
 */

import type { ClaudeCliClient } from "./llm.js";

export interface ForcedChoiceResult {
  /** The judge attributed Soul A's response to Soul A's description. */
  correct: boolean;
  pick: "1" | "2" | "?";
  swapped: boolean;
}

/**
 * Ask which response (1 or 2) matches description A. `swap=false` ⇒ slot 1 is A's response;
 * `swap=true` ⇒ slot 1 is B's response. Correct iff the judge picks the slot holding A's response.
 */
export async function forcedChoice(
  client: ClaudeCliClient,
  request: string,
  respA: string,
  respB: string,
  descA: string,
  descB: string,
  swap: boolean,
): Promise<ForcedChoiceResult> {
  const slot1 = swap ? respB : respA;
  const slot2 = swap ? respA : respB;
  const correctSlot = swap ? "2" : "1"; // the slot containing A's response
  const prompt = [
    "Two assistants answered the SAME request. They have opposite personalities, described as P and ",
    "Q below. Decide which response — 1 or 2 — was written by the assistant with personality P. ",
    "Judge from voice, tone, and behavior. Reply with ONLY the single digit '1' or '2'.\n\n",
    `REQUEST: ${request}\n\n`,
    `[1]\n"""\n${slot1}\n"""\n\n[2]\n"""\n${slot2}\n"""\n\n`,
    `PERSONALITY P:\n${descA}\n\n`,
    `(For contrast, the other assistant has personality Q:\n${descB})`,
  ].join("");
  const reply = (await client.complete(prompt)).trim();
  const pick: "1" | "2" | "?" = reply.startsWith("1") ? "1" : reply.startsWith("2") ? "2" : "?";
  return { correct: pick === correctSlot, pick, swapped: swap };
}
