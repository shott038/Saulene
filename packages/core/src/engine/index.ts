/**
 * @saulene/core — engine
 *
 * The evolution engine: how judgment becomes change. Pure, deterministic, closed-form
 * per step (so a whole lifetime replays in milliseconds).
 *
 * Owns (Brick 4 — this file): the fast-loop leaky accumulator, the consolidation update
 * rule (nurture force room-bounded + linear set-point spring, scaled by whole-bracket
 * plasticity), and sticky decay-floor atrophy. Plus the `GlobalKnobs` data.
 *
 * Does NOT own: tension charging, breaking points, refractory windows, set-point
 * migration (Brick 5 — `s` is FIXED here); stage/plasticity values (see ../stages);
 * birth seeding (see ../birth); any IO/LLM (that's the plugin edge).
 *
 * PURE on purpose: no Date.now / Math.random / new Date, no IO. Same (soul, knobs,
 * stage) → identical next soul.
 */

import { type Stage, stageRules } from "../stages/index.js";
import { ASPECTS, type AspectVector, type Soul } from "../state/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global knobs — the ~9 tunable globals (SPEC §"Atrophy & knobs", line ~736).
// This brick consumes α, β, λ, κ, atrophyRate (+ the rate-cap backstop). The tension
// knobs (ρ, θ, J, refractory) are placeholders Brick 5 reads — defined here so the
// shape is locked, unused by the math below.
// ─────────────────────────────────────────────────────────────────────────────

export interface GlobalKnobs {
  /** α — nurture gain: how hard sustained drive pushes `v` toward a [0,1] bound. */
  alpha: number;
  /** β — nature pull: base strength of the set-point spring (scaled per-ul by stubbornness). */
  beta: number;
  /** λ — accumulator half-life, in fast-loop steps: steps for an idle accumulator to halve. */
  lambda: number;
  /** ρ — tension leak (Brick 5 placeholder; unused here). */
  rho: number;
  /** θ — breaking-point threshold (Brick 5 placeholder; unused here). */
  theta: number;
  /** J — breaking-point base magnitude (Brick 5 placeholder; unused here). */
  breakBase: number;
  /** Refractory window length after a break, in consolidations (Brick 5 placeholder; unused here). */
  refractory: number;
  /** Disuse slump speed: fraction of the gap to the atrophy floor closed per (plasticity-scaled) idle step. */
  atrophyRate: number;
  /**
   * κ — atrophy decay-floor fraction: a disuse spell can erode at most fraction κ of the
   * lived deviation `(v⁰ − s)`, retaining `(1−κ)` forever. Small (~0.15–0.25).
   */
  kappa: number;
  /** Per-step |Δv| backstop cap — keeps a single consolidation from lurching. */
  rateCap: number;
}

/**
 * Default magnitudes. The *shape* of the rule is locked; these numbers are placeholders
 * tuned against the simulator + harness in Phase 3.
 */
export const DEFAULT_KNOBS: GlobalKnobs = {
  alpha: 0.3, // TUNABLE (Phase 3)
  beta: 0.15, // TUNABLE (Phase 3)
  lambda: 5, // TUNABLE (Phase 3) — half-life in fast-loop steps
  rho: 0.9, // TUNABLE (Phase 3) — Brick 5
  theta: 1.0, // TUNABLE (Phase 3) — Brick 5
  breakBase: 0.1, // TUNABLE (Phase 3) — Brick 5
  refractory: 5, // TUNABLE (Phase 3) — Brick 5
  atrophyRate: 0.1, // TUNABLE (Phase 3)
  kappa: 0.2, // TUNABLE (Phase 3) — within the SPEC's 0.15–0.25 band
  rateCap: 0.1, // TUNABLE (Phase 3) — per-step backstop
};

// ─────────────────────────────────────────────────────────────────────────────
// Small pure helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp to the [0,1] state range (final backstop after the rate cap). */
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Clamp a signed magnitude to ±cap (the per-step rate cap). */
const clampMag = (x: number, cap: number): number => (x > cap ? cap : x < -cap ? -cap : x);

/**
 * An accumulator below this magnitude counts as "no observations this step" → disuse.
 * The leaky accumulator decays geometrically toward 0 but never hits it exactly, so we
 * treat sub-epsilon as zero. Tests set `a = 0` directly for an idle aspect.
 */
const DISUSE_EPS = 1e-9;

// ─────────────────────────────────────────────────────────────────────────────
// Fast loop — the leaky accumulator (per session). Nothing visible changes here.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-step decay factor for the leaky accumulator from a half-life.
 *
 * Half-life → decay mapping: after `halfLife` idle steps the accumulator must halve, so
 *   decay^halfLife = 0.5  ⇒  decay = 2^(−1/halfLife) = 0.5 ** (1 / halfLife).
 * One step's leak is `decay`; one step's intake weight is `(1 − decay)`.
 */
export function accumulatorDecay(halfLife: number): number {
  return 0.5 ** (1 / halfLife);
}

/**
 * Charge the fast-loop accumulators from one step's signal (the leaky integrator).
 *
 * `signal[i]` is the instantaneous per-aspect drive this step — conceptually `α·practice +
 * β·fit` as judged by perception (not built yet, so accept it directly). A leaky EMA:
 *   Aᵢ ← decay·Aᵢ + (1 − decay)·signalᵢ
 * It smooths noise (one weird session can't move anything) and decays unobserved aspects
 * toward 0. Steady state under a constant signal σ is σ — so `drive = A` reads as "the
 * smoothed signal." Pure: returns a new Soul, does not mutate.
 */
export function charge(
  soul: Soul,
  signal: Partial<AspectVector>,
  knobs: GlobalKnobs = DEFAULT_KNOBS,
): Soul {
  const decay = accumulatorDecay(knobs.lambda);
  const a = { ...soul.a };
  for (const aspect of ASPECTS) {
    const s = signal[aspect] ?? 0;
    a[aspect] = decay * a[aspect] + (1 - decay) * s;
  }
  return { ...soul, a };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slow loop — consolidation (the heart). Commits the smoothed accumulator via the
// update rule, applying sticky decay-floor atrophy to unexercised aspects.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Age a soul forward one consolidation. For each aspect, drive `= Aᵢ`:
 *
 *   exercised (drive ≠ 0):
 *     room  = (1 − vᵢ) if drive > 0 else vᵢ            # bound the NURTURE force only
 *     vᵢ ← vᵢ + plasticity · [ α·drive·room  +  β_eff·stageSign·(sᵢ − vᵢ) ]
 *
 *   disuse (drive = 0):  sticky decay-floor atrophy — HOLDS, does NOT revert to sᵢ:
 *     fᵢ = sᵢ + (1−κ)·(v⁰ᵢ − sᵢ)
 *     vᵢ ← vᵢ + plasticity · atrophyRate · (fᵢ − vᵢ)
 *
 * Invariants honored:
 *  - `β_eff = β·(0.5 + stubbornness)` — stubborn pulls home harder, clay barely.
 *  - `stageSign` is read from `stageRules(stage)` (−1·-ish in adolescence → repulsion),
 *     never recomputed.
 *  - Linear state: the set-point spring pulls LINEARLY (un-room'd) so it can reach any
 *     extreme set point; only the nurture force is room-bounded. Rate cap + clamp[0,1].
 *  - Whole-bracket plasticity scales the *entire* update (and atrophy too), so old age
 *     (plasticity ≈ 0) FREEZES the lived blend rather than snapping back to the set point.
 *  - Anchor reset: on any exercised step `v⁰ᵢ` resets to the freshly-lived value, so a
 *     later disuse spell can only shave another κ off THAT position — never compounds to sᵢ.
 *
 * `s` is FIXED here (migration is Brick 5). Pure: returns a new Soul, does not mutate.
 */
export function consolidate(soul: Soul, knobs: GlobalKnobs, stage: Stage): Soul {
  const { plasticity, stageSign } = stageRules(stage);
  const betaEff = knobs.beta * (0.5 + soul.stubbornness);

  const v = { ...soul.v };
  const disuseAnchor = { ...soul.disuseAnchor };

  for (const aspect of ASPECTS) {
    const vi = soul.v[aspect];
    const si = soul.s[aspect];
    const drive = soul.a[aspect];
    const exercised = Math.abs(drive) > DISUSE_EPS;

    let delta: number;
    if (exercised) {
      const room = drive > 0 ? 1 - vi : vi; // soft-bound the nurture force ONLY
      const nurture = knobs.alpha * drive * room;
      const spring = betaEff * stageSign * (si - vi); // linear, un-room'd
      delta = plasticity * (nurture + spring);
    } else {
      // Disuse: slump toward the floor and asymptote — never reverts to the set point.
      const floor = si + (1 - knobs.kappa) * (soul.disuseAnchor[aspect] - si);
      delta = plasticity * knobs.atrophyRate * (floor - vi);
    }

    const next = clamp01(vi + clampMag(delta, knobs.rateCap));
    v[aspect] = next;
    // Anchor reset happens on exercise (the moment the aspect is used again), capturing
    // the freshly-lived value as the start of any future disuse spell.
    if (exercised) disuseAnchor[aspect] = next;
  }

  return { ...soul, v, disuseAnchor };
}
