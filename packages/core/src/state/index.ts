/**
 * @saulene/core — state
 *
 * The canonical Soul data model: the 10 Big Five aspect floats, their set points,
 * accumulators, tension, disuse anchors, age (MP), stage, and per-ul innate traits.
 * Pure types + constructors only. No behavior lives here.
 */

/** The 10 Big Five aspects (engine truth; MBTI is display-only, derived elsewhere). */
export const ASPECTS = [
  "openness",
  "intellect",
  "industriousness",
  "orderliness",
  "enthusiasm",
  "assertiveness",
  "compassion",
  "politeness",
  "withdrawal",
  "volatility",
] as const;

export type Aspect = (typeof ASPECTS)[number];

/** A value in [0,1] for every aspect. Stored as a raw float — no quantization. */
export type AspectVector = Record<Aspect, number>;

export type Sex = "male" | "female";

export interface Soul {
  /** Current disposition value per aspect, [0,1]. */
  v: AspectVector;
  /** Innate set points (nature), [0,1]. Fixed by default; migrates only on a breaking point. */
  s: AspectVector;
  /** Leaky-integrator accumulators (fast loop), per aspect. */
  a: AspectVector;
  /** Tension per aspect (charges on "did a lot AND hated it"). */
  tension: AspectVector;
  /** Disuse anchor per aspect: value at the start of the current disuse spell (atrophy floor). */
  disuseAnchor: AspectVector;
  /** Per-ul position on the stubborn↔clay spectrum, [0,1] (0 = clay, 1 = stubborn). */
  stubbornness: number;
  /** Birth attribute; affects seeding only, never voice/behavior. */
  sex: Sex;
  /** Age in maturity points (not wall-clock, not raw session count). */
  mp: number;
  /** Last-use timestamp (epoch ms). Drives the flat 90-day neglect-death clock. */
  lastUsedAt: number;
}

// TODO(core): Soul constructors/validators. Implemented alongside the engine.
