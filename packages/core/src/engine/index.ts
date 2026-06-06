/**
 * @saulene/core — engine
 *
 * The evolution engine: how judgment becomes change. Pure, deterministic, closed-form
 * per step (so a whole lifetime replays in milliseconds).
 *
 * Owns (Brick 4): the fast-loop leaky accumulator, the consolidation update rule (nurture
 * force room-bounded + linear set-point spring, scaled by whole-bracket plasticity), and
 * sticky decay-floor atrophy. Plus the `GlobalKnobs` data.
 *
 * Owns (Brick 5 — this file too): the tension fast loop (`chargeTension`), and — folded into
 * `consolidate` after the normal update — rare earned breaking points (stubborn snaps home +
 * resents, clay reconfigures toward the lived direction), per-aspect refractory windows, and
 * the tiny hard-capped lifetime-budgeted set-point migration (the ONLY place `s` may move).
 *
 * Does NOT own: stage/plasticity values (see ../stages); birth seeding (see ../birth); any
 * IO/LLM (that's the plugin edge).
 *
 * PURE on purpose: no Date.now / Math.random / new Date, no IO. Same (soul, knobs,
 * stage) → identical next soul.
 */

import { type Stage, stageRules } from "../stages/index.js";
import { ASPECTS, type AspectVector, type Soul } from "../state/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Global knobs — the ~9 tunable globals (SPEC §"Atrophy & knobs", line ~736).
// Brick 4 consumes α, β, λ, κ, atrophyRate (+ the rate-cap backstop). Brick 5 consumes the
// tension/break knobs ρ, θ, J, refractory (no longer placeholders) plus four it adds:
// w (tension intake), resentmentGain, migrationFraction, migrationStepCap.
// ─────────────────────────────────────────────────────────────────────────────

export interface GlobalKnobs {
  /** α — nurture gain: how hard sustained drive pushes `v` toward a [0,1] bound. */
  alpha: number;
  /** β — nature pull: base strength of the set-point spring (scaled per-ul by stubbornness). */
  beta: number;
  /** λ — accumulator half-life, in fast-loop steps: steps for an idle accumulator to halve. */
  lambda: number;
  /** ρ — tension leak per step, <1: a one-off bad session bleeds off and never breaks alone. */
  rho: number;
  /** θ — breaking-point threshold: tension must exceed this for an aspect to rupture. */
  theta: number;
  /** J — breaking-point base magnitude: the `v` jump is `breakBase · Tᵢ_at_break`. */
  breakBase: number;
  /** Refractory window length after a break, in consolidations: no re-break on that aspect while > 0. */
  refractory: number;
  /** w — tension intake weight: how hard `max(0,−fit)·practice` charges tension each step. */
  tensionIntake: number;
  /**
   * Resentment gain: a STUBBORN ul's break raises that aspect's `betaGain` by
   * `resentmentGain · stubbornness` (clay, stubbornness→0, gains no resentment).
   */
  resentmentGain: number;
  /** Fraction of the lived gap `(vᵢ − sᵢ)` that a break migrates `sᵢ` (before caps). Small. */
  migrationFraction: number;
  /** Hard cap on |Δsᵢ| from a single break — the per-break migration ceiling. Tiny. */
  migrationStepCap: number;
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
  rho: 0.9, // TUNABLE (Phase 3) — Brick 5 tension leak
  theta: 1.0, // TUNABLE (Phase 3) — Brick 5 break threshold
  breakBase: 0.1, // TUNABLE (Phase 3) — Brick 5 break magnitude base
  refractory: 5, // TUNABLE (Phase 3) — Brick 5 refractory window
  tensionIntake: 0.5, // TUNABLE (Phase 3) — Brick 5 tension intake weight (w)
  resentmentGain: 0.5, // TUNABLE (Phase 3) — Brick 5 stubborn-break betaGain bump
  migrationFraction: 0.1, // TUNABLE (Phase 3) — Brick 5 fraction of (v−s) migrated per break
  migrationStepCap: 0.02, // TUNABLE (Phase 3) — Brick 5 per-break |Δs| cap
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

/**
 * Per-session signal for the TENSION loop. Distinct from `charge`'s pre-mixed `drive`:
 * tension needs the RAW per-aspect `practice` (how much the aspect was exercised, ≥ 0) and
 * `fit` (how well that sat with the ul's nature, signed) so it can charge only on the
 * "did a lot AND hated it" combination. Missing aspects default to 0.
 */
export interface TensionSignal {
  /** How much each aspect was exercised this session (magnitude, ≥ 0). */
  practice: Partial<AspectVector>;
  /** How well that exercise fit the ul's nature, signed (negative = hated it). */
  fit: Partial<AspectVector>;
}

/**
 * Charge the tension accumulators from one session (the SLOW grievance loop):
 *   Tᵢ ← ρ·Tᵢ + w·max(0, −fitᵢ)·practiceᵢ
 *
 * Only NEGATIVE fit under real practice charges tension — doing a lot of something the ul
 * HATES. Positive/neutral fit adds nothing, so tension just leaks (ρ < 1) toward 0. The leak
 * guarantees a one-off bad session bleeds off and never accumulates to a break on its own;
 * only sustained, repeated hated practice climbs past θ. Pure: returns a new Soul.
 *
 * Separate from `charge` on purpose — it reads a different signal shape and does NOT touch the
 * `a` accumulators, so the Brick-4 fast loop is untouched.
 */
export function chargeTension(
  soul: Soul,
  signal: TensionSignal,
  knobs: GlobalKnobs = DEFAULT_KNOBS,
): Soul {
  const tension = { ...soul.tension };
  for (const aspect of ASPECTS) {
    const practice = signal.practice[aspect] ?? 0;
    const fit = signal.fit[aspect] ?? 0;
    const hated = fit < 0 ? -fit : 0; // max(0, −fit)
    tension[aspect] = knobs.rho * soul.tension[aspect] + knobs.tensionIntake * hated * practice;
  }
  return { ...soul, tension };
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
 * THEN (Brick 5) breaking points are evaluated per aspect AFTER the normal update — the only
 * thing that moves `s`. This wraps, not replaces, the rule above: with tension below θ (and
 * betaGain 1.0, refractory 0, budget full) every Brick-5 branch is a no-op, so the output is
 * byte-identical to the pre-Brick-5 consolidation. For an over-θ, non-refractory aspect i:
 *
 *   J = breakBase · Tᵢ                                  # magnitude scales with tension at break
 *   route = 1 − 2·stubbornness                          # +1 clay → escape, −1 stubborn → home
 *   vᵢ ← clamp(vᵢ + J·sign(vᵢ−sᵢ)·route)                # one signed jump; home snap can't pass s
 *   stubborn only: betaGain[i] ·= 1 + resentmentGain·stubbornness   # resentment deepens the pull
 *   sᵢ ← sᵢ + cap(migrationFraction·(1−stubbornness)·(vᵢ−sᵢ))       # tiny, clay > stubborn, budgeted
 *   Tᵢ ← 0 ; refractory[i] ← knobs.refractory           # discharge + no re-break until it elapses
 *
 * Per-aspect refractory countdowns decrement every consolidation. Pure: returns a new Soul.
 */
export function consolidate(soul: Soul, knobs: GlobalKnobs, stage: Stage): Soul {
  const { plasticity, stageSign } = stageRules(stage);

  const v = { ...soul.v };
  const s = { ...soul.s };
  const tension = { ...soul.tension };
  const disuseAnchor = { ...soul.disuseAnchor };
  const refractory = { ...soul.refractory };
  const betaGain = { ...soul.betaGain };
  let migrationBudget = soul.migrationBudget;

  for (const aspect of ASPECTS) {
    const vi = soul.v[aspect];
    const si = soul.s[aspect];
    const drive = soul.a[aspect];
    // betaGain (resentment) is per-aspect; default 1.0 ⇒ identical to pre-Brick-5 spring.
    const betaEff = knobs.beta * (0.5 + soul.stubbornness) * soul.betaGain[aspect];
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

    // Normal-update result (the lived value this consolidation).
    const next = clamp01(vi + clampMag(delta, knobs.rateCap));

    // ── Refractory countdown: every consolidation, floored at 0. ──
    const refIn = soul.refractory[aspect];
    refractory[aspect] = refIn > 0 ? refIn - 1 : 0;

    // ── Breaking point — rare, earned. Evaluated AFTER the normal update. ──
    let finalV = next;
    const ti = soul.tension[aspect];
    if (ti > knobs.theta && refIn === 0) {
      const j = knobs.breakBase * ti; // jump magnitude scales with tension at break
      const dev = next - si; // lived deviation, post normal-update
      const devSign = dev > 0 ? 1 : dev < 0 ? -1 : 0;
      // Single signed routing term varies the direction per aspect by its own deviation:
      // stubbornness 1 → route −1 (snap HOME), 0 → +1 (ESCAPE/reconfigure), 0.5 → 0.
      const route = 1 - 2 * soul.stubbornness;
      let jump = j * devSign * route;
      // A homeward snap must not fly past the set point — land at most on s.
      if (devSign !== 0 && Math.sign(jump) === -devSign && Math.abs(jump) > Math.abs(dev)) {
        jump = -dev;
      }
      finalV = clamp01(next + jump);

      // Resentment: a stubborn break deepens the homeward pull for THIS aspect only
      // (clay, stubbornness→0, gains none). Compounds across rare repeat breaks.
      betaGain[aspect] = soul.betaGain[aspect] * (1 + knobs.resentmentGain * soul.stubbornness);

      // Capped, lifetime-budgeted set-point migration toward the lived value — clay migrates
      // more than stubborn. The ONLY place `s` moves. Per-break cap, then the shared budget.
      const clayness = 1 - soul.stubbornness;
      const dS = clampMag(knobs.migrationFraction * clayness * dev, knobs.migrationStepCap);
      const dSmag = Math.min(Math.abs(dS), migrationBudget);
      s[aspect] = si + (dS < 0 ? -dSmag : dSmag);
      migrationBudget -= dSmag;

      // Discharge + enter refractory: T resets; no re-break until the window elapses.
      tension[aspect] = 0;
      refractory[aspect] = knobs.refractory;
    }

    v[aspect] = finalV;
    // Anchor reset on exercise: capture the freshly-lived (post-break) value as the start
    // of any future disuse spell.
    if (exercised) disuseAnchor[aspect] = finalV;
  }

  return { ...soul, v, s, tension, disuseAnchor, refractory, betaGain, migrationBudget };
}
