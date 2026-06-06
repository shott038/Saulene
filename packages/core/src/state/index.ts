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
  /**
   * Per-aspect breaking-point refractory countdown, in consolidations. 0 = ready to break;
   * a fresh break sets it to `knobs.refractory` and each consolidation decrements it. While
   * > 0 the aspect cannot break again (dual-threshold/refractory → no chatter).
   */
  refractory: AspectVector;
  /**
   * Per-aspect homeward-pull multiplier on `β_eff`, default 1.0. A break on a STUBBORN ul
   * raises this for that aspect (resentment: nature pulls home harder afterward). At 1.0 the
   * consolidation spring is identical to pre-Brick-5 — the no-regression anchor.
   */
  betaGain: AspectVector;
  /**
   * Remaining lifetime set-point (`s`) displacement budget, summed across all aspects/breaks.
   * The ONLY thing that lets `s` move is a breaking point, and only while this is > 0. Once
   * spent, breaks still reconfigure `v` but `s` freezes — caps + rarity enforce the no-mirror
   * rule (nature never slowly becomes a reflection of how the ul is used).
   */
  migrationBudget: number;
  /** Per-ul position on the stubborn↔clay spectrum, [0,1] (0 = clay, 1 = stubborn). */
  stubbornness: number;
  /** Birth attribute; affects seeding only, never voice/behavior. */
  sex: Sex;
  /** Age in maturity points (not wall-clock, not raw session count). */
  mp: number;
  /** Last-use timestamp (epoch ms). Drives the flat 90-day neglect-death clock. */
  lastUsedAt: number;
}

/**
 * Initial lifetime set-point migration budget seeded at birth — the total `s` displacement
 * (summed |Δs| across every aspect and every break) a single ul may ever accrue. Deliberately
 * tiny + conservative: rarity (breaks are earned) plus this hard ceiling together prevent
 * runaway drift / usage-convergence. The per-break and per-step caps live in `GlobalKnobs`.
 */
export const MIGRATION_BUDGET_INIT = 0.1; // TUNABLE (Phase 3) — lifetime |Δs| ceiling per ul

// TODO(core): Soul constructors/validators. Implemented alongside the engine.
