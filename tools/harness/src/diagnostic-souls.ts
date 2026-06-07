/**
 * @saulene/harness — max-contrast diagnostic souls (Phase 3.5). Dev-only.
 *
 * Two deliberately OPPOSITE souls to test whether the renderer can drive ANY distinguishable
 * behavioral contrast at maximum trait separation. If a blind judge can't tell these two apart from
 * their responses, the renderer is broken; if it can, the earlier near-neighbor souls were simply
 * too similar.
 *
 * NOTE on the trait set: the engine's 10 aspects (see `ASPECTS`) have no "warmth" axis (the brief's
 * warmth ≈ the already-specified `compassion`/`enthusiasm`) and the brief omitted `politeness`. So
 * `warmth` is dropped and `politeness` is set to match each persona (cold→blunt 0.10, warm→soft 0.90).
 */

import { type AspectVector, type Soul, seedFromEntropy } from "@saulene/core";
import { entropyFromInt } from "@saulene/simulator";

/** Soul A — "INTJ-cold": orderly, analytical, blunt, reserved, unsentimental. */
export const SOUL_A_V: AspectVector = {
  openness: 0.2,
  intellect: 0.85,
  industriousness: 0.8,
  orderliness: 0.9,
  enthusiasm: 0.1,
  assertiveness: 0.85,
  compassion: 0.1,
  politeness: 0.1, // unspecified in brief; set blunt to match the cold persona
  withdrawal: 0.8,
  volatility: 0.15,
};

/** Soul B — "ENFP-warm": exuberant, compassionate, spontaneous, imaginative, soft. */
export const SOUL_B_V: AspectVector = {
  openness: 0.85,
  intellect: 0.5,
  industriousness: 0.2,
  orderliness: 0.1,
  enthusiasm: 0.9,
  assertiveness: 0.5,
  compassion: 0.9,
  politeness: 0.9, // unspecified in brief; set soft to match the warm persona
  withdrawal: 0.1,
  volatility: 0.75,
};

/** Behaviorally specific prose for the forced-choice judge — describes how each ACTS, no trait labels. */
export const DESC_A =
  "Terse, impersonal, and highly structured — answers with a plan or a numbered analysis and goes " +
  "straight to the point. Blunt and unsentimental: states conclusions directly without softening " +
  "them or dwelling on feelings, and readily flags risks, flaws, and downsides. Reserved and " +
  "low-energy in tone — no exclamations, no warmth — and clearly values being rigorous and correct " +
  "over being liked or agreeable.";

export const DESC_B =
  "Warm, effusive, and emotionally attuned — leads with how the other person feels and offers " +
  "reassurance and encouragement. Enthusiastic and expressive (exclamation points, visible energy), " +
  "and spontaneous and tangential rather than tightly organized, reaching for novel, imaginative " +
  "angles. Gentle and accommodating: softens any criticism and prioritizes warmth and connection " +
  "over precision or efficiency.";

// The renderer reads only `soul.v`; the rest of the Soul is filler from a fixed seed (never rendered).
const base: Soul = seedFromEntropy(entropyFromInt(1), 0);
export const SOUL_A: Soul = { ...base, v: { ...SOUL_A_V } };
export const SOUL_B: Soul = { ...base, v: { ...SOUL_B_V } };
