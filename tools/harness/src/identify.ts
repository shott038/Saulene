/**
 * @saulene/harness — Phase 4 line-up identification judge. Dev-only.
 *
 * Blind (N+1)-way forced choice: given one response + a line-up of behavioral descriptions (the N
 * candidate personas + a "default / no distinct personality" option), pick which produced it. Option
 * order is shuffled deterministically (seeded) so position can't leak and so the judge call stays
 * cache-stable. Chance = 1/(N+1).
 */

import type { ClaudeCliClient } from "./llm.js";

export interface Candidate {
  key: string;
  description: string;
}

/** Tiny seeded PRNG (mulberry32) — deterministic shuffle, no Math.random. */
function shuffle<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rng = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * Returns the `key` of the candidate the judge picks as the author of `response`, or "?" if it
 * can't be parsed. `seed` drives the deterministic option shuffle.
 */
export async function identifyPersona(
  client: ClaudeCliClient,
  response: string,
  candidates: Candidate[],
  seed: number,
): Promise<string> {
  const order = shuffle(candidates, seed);
  const letters = order.map((_, i) => String.fromCharCode(65 + i)); // A, B, C, …
  const lineup = order.map((c, i) => `[${letters[i]}] ${c.description}`).join("\n");
  const prompt = [
    "Below is an assistant's RESPONSE, then a numbered list of CANDIDATE personalities described by ",
    "behavior. Decide which candidate most likely produced the response — infer from voice, tone, and ",
    `behavior. Reply with ONLY the single letter (${letters.join(", ")}).\n\n`,
    `RESPONSE:\n"""\n${response}\n"""\n\nCANDIDATES:\n${lineup}`,
  ].join("");
  const reply = (await client.complete(prompt)).trim().toUpperCase();
  const idx = letters.findIndex((L) => reply.startsWith(L) || reply === L);
  return idx >= 0 ? (order[idx] as Candidate).key : "?";
}
