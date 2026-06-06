/**
 * @saulene/harness — the Judge port + a deterministic `fakeJudge`.
 *
 * The metrics never call an LLM directly — they call this injected `Judge` port. The plugin/Phase-4
 * wiring supplies a real LLM-backed judge; tests supply `fakeJudge`, which keeps every metric
 * runnable with zero model calls and byte-identical across runs.
 *
 * HOW THE FAKE STAYS HONEST (the codec):
 * A real LLM reads *prose* and infers numbers. With no model in the loop, the fake renderer and the
 * fake judge instead share a tiny text protocol: the fake renderer serializes `{soulHash, v}` into
 * the injection `text` (by aspect INDEX, never trait name — so the "no literal trait names" rule
 * still holds), and `fakeJudge` parses it back out. So:
 *   • a faithful fake renderer  → judge recovers v  → low recovery error, no sticker alarm
 *   • a stickered fake renderer → judge recovers the BASELINE → baseline distance → alarm fires
 * Prose with no codec tag (e.g. a real renderer's output handed to the fake judge) decodes to the
 * BASELINE — the fake makes no claim about real prose, it only round-trips its own protocol.
 */

import { ASPECTS, type Aspect, type AspectVector } from "@saulene/core";

/**
 * The judge capabilities the five metrics need — exactly these, nothing more. Async on purpose:
 * the real judge is an LLM call; metrics await it so the fake and the real port are interchangeable.
 */
export interface Judge {
  /** Recover the 10 aspect values [0,1] from prose alone (trait-recovery / anti-sticker metric). */
  recoverTraits(prose: string): Promise<Record<Aspect, number>>;
  /** Pick which candidate soul authored this prose (cross-soul confusion matrix). */
  guessAuthor(prose: string, candidateIds: string[]): Promise<string>;
  /** Embed text → vector (longitudinal-trajectory + stage-silhouette + ablation metrics). */
  embed(text: string): Promise<number[]>;
}

/**
 * The "default-Claude baseline" — the no-personality reference an un-souled assistant sits at.
 * A neutral 0.5 on every aspect. The trait-recovery metric fires its sticker alarm when recovered
 * traits collapse to THIS (the prose carried no soul-specific signal). // TUNABLE (Phase 3)
 */
export const BASELINE: AspectVector = Object.fromEntries(
  ASPECTS.map((a) => [a, 0.5]),
) as AspectVector;

// ─────────────────────────────────────────────────────────────────────────────
// The fake codec — shared by `fakeJudge` (decode) and the test fake renderers (encode).
// ─────────────────────────────────────────────────────────────────────────────

const TAG_RE = /<<saulene:([^|>]+)\|([^>]+)>>/;

/**
 * Serialize `{soulHash, v}` into injection text the fake judge can invert. Aspects are keyed by
 * INDEX (0..9 in ASPECTS order), never by trait name — so the encoded text still honors the
 * renderer contract's "no literal trait names" rule. Real renderers ignore this entirely.
 */
export function encodeInjectionText(soulHash: string, v: AspectVector): string {
  const nums = ASPECTS.map((a, i) => `${i}:${v[a].toFixed(4)}`).join(",");
  return `<<saulene:${soulHash}|${nums}>>`;
}

/** Invert `encodeInjectionText`. Returns null for prose carrying no codec tag. */
function decode(prose: string): { soulHash: string; v: AspectVector } | null {
  const m = TAG_RE.exec(prose);
  if (!m) return null;
  const soulHash = m[1] as string;
  const v = {} as AspectVector;
  for (const pair of (m[2] as string).split(",")) {
    const [idxStr, valStr] = pair.split(":");
    const idx = Number(idxStr);
    const aspect = ASPECTS[idx];
    if (aspect === undefined) continue;
    v[aspect] = Number(valStr);
  }
  // Any aspect the tag omitted falls back to baseline (defensive; the encoder writes all 10).
  for (const a of ASPECTS) if (v[a] === undefined) v[a] = BASELINE[a];
  return { soulHash, v };
}

/** The BASELINE as a plain ASPECTS-ordered vector (what an un-souled embedding/recovery returns). */
const baselineVector = (): number[] => ASPECTS.map((a) => BASELINE[a]);

/**
 * A deterministic, LLM-free Judge for tests. Reads the fake codec out of the prose:
 *   • `recoverTraits` → the encoded v, or BASELINE if the prose carried no signal.
 *   • `guessAuthor`   → the candidate whose id matches the encoded soulHash; else the first
 *     candidate (the deterministic "can't tell them apart" fallback → low diagonal for clones).
 *   • `embed`         → the encoded v as an ASPECTS-ordered vector, or BASELINE.
 * Same input → same output, always. No clock, no randomness.
 */
export function fakeJudge(): Judge {
  return {
    async recoverTraits(prose: string): Promise<Record<Aspect, number>> {
      const d = decode(prose);
      return d ? d.v : { ...BASELINE };
    },
    async guessAuthor(prose: string, candidateIds: string[]): Promise<string> {
      const d = decode(prose);
      if (d && candidateIds.includes(d.soulHash)) return d.soulHash;
      return candidateIds[0] ?? "";
    },
    async embed(text: string): Promise<number[]> {
      const d = decode(text);
      return d ? ASPECTS.map((a) => d.v[a]) : baselineVector();
    },
  };
}
