/**
 * @saulene/core — stages
 *
 * Life stages (Childhood / Adolescence / Early adulthood / Old adulthood) and aging.
 * Each stage rewrites engine rules: plasticity, set-point-pull sign+strength
 * (adolescence inverts → repulsion), and volatility. Plus MP accrual (rate-capped)
 * and stage-transition boundaries (fixed MP bands + slight per-ul jitter).
 *
 * Pure: no Date.now / Math.random / new Date. Any per-ul jitter is derived
 * deterministically from the soul (a stable hash), never live entropy — so the same
 * ul always crosses each stage boundary on the same clock.
 *
 * Stage parameters are data, consumed by the engine (Brick 4). This brick is structural:
 * it locks the *shape* (the four stages, the rule knobs, the ordering, the signs).
 * Magnitudes here are placeholders flagged `TUNABLE (Phase 3)`.
 */

import { ASPECTS, type Soul } from "../state/index.js";

/** The four discrete life stages, in maturity order. */
export type Stage = "childhood" | "adolescence" | "early_adulthood" | "old_adulthood";

/** Stages in ascending maturity order — the canonical ordering the engine relies on. */
export const STAGES = [
  "childhood",
  "adolescence",
  "early_adulthood",
  "old_adulthood",
] as const satisfies readonly Stage[];

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage rule table — the knobs the consolidation engine (Brick 4) consumes.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The engine knobs a single stage carries. Fed into the update rule:
 *   vᵢ ← vᵢ + plasticity·[ α·drive·room + β_eff·stageSign·(sᵢ − vᵢ) ]
 */
export interface StageRules {
  /**
   * Whole-bracket plasticity, scales the *entire* update. Ordering is an invariant:
   * childhood ≥ adolescence > early_adulthood > old_adulthood (floor ≈0, not literally 0,
   * so old age FREEZES the lived blend instead of snapping back to the set point).
   */
  plasticity: number;
  /**
   * Set-point-pull multiplier — the load-bearing trick. `+1` normally; **small & negative
   * in adolescence** (the pull inverts → repulsion, but a residual tether keeps nature
   * quietly coloring what the ul is drawn to try — it never goes fully off). Folds both the
   * inversion (sign) and the residual-tether dampening (magnitude < 1) into one knob so the
   * engine just multiplies. `β_eff·stageSign·(s−v)` with a small negative stageSign ⇒ a
   * faint repulsion: the teen rebels *as itself*.
   */
  stageSign: number;
  /**
   * Stage volatility — how wide the swings run. Low-med in childhood, **spikes** in
   * adolescence, settles in early adulthood, low (calm of age) in old age. Consumed by the
   * engine as a noise/spread scale; not a probability.
   */
  volatility: number;
}

/**
 * The per-stage table. Magnitudes are placeholders — the *shape* is what's locked
 * (ordering, signs, the adolescent bump). Tuned against the simulator + harness in Phase 3.
 *
 * Invariants (NOT tunable — do not break):
 *  - plasticity: childhood ≥ adolescence > early_adulthood > old_adulthood (floor).
 *  - stageSign: negative ONLY in adolescence; +1 everywhere else.
 *  - old_adulthood plasticity is the floor (smallest, ≈0 but > 0).
 */
export const STAGE_RULES: Record<Stage, StageRules> = {
  // Absorbs everything; innate temperament shows clearly; MBTI readout unstable.
  childhood: { plasticity: 1.0, stageSign: 1, volatility: 0.4 }, // TUNABLE (Phase 3) — magnitudes
  // Pull inverts (repulsion) but stays small (residual tether); volatility spikes; divergence is born.
  adolescence: { plasticity: 0.85, stageSign: -0.3, volatility: 1.0 }, // TUNABLE (Phase 3) — magnitudes
  // Rebellion resolves; integrates the teen experiments; crystallization happens here.
  early_adulthood: { plasticity: 0.45, stageSign: 1, volatility: 0.5 }, // TUNABLE (Phase 3) — magnitudes
  // Locked: floor plasticity freezes the lived blend; only slow wisdom-drift; calm of age.
  old_adulthood: { plasticity: 0.05, stageSign: 1, volatility: 0.15 }, // TUNABLE (Phase 3) — magnitudes
};

/** Look up the engine knobs for a stage. */
export function stageRules(stage: Stage): StageRules {
  return STAGE_RULES[stage];
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage transitions — fixed MP age bands + slight per-ul jitter.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MP at each of the three stage boundaries, ascending:
 *   [0] childhood → adolescence
 *   [1] adolescence → early_adulthood
 *   [2] early_adulthood → old_adulthood
 *
 * Fixed bands so the lifespan is predictable to design around. Crystallization (entering
 * early adulthood) is a *milestone reached*, not a fixed date — heavy use reaches it sooner
 * in wall-clock, but MP accrual is rate-capped (see accrueMp) so it can't be farmed.
 *
 * Spacing invariant: each gap must exceed 2·BOUNDARY_JITTER_MP, so jittered boundaries
 * never cross or reorder.
 */
export const STAGE_BANDS: readonly [number, number, number] = [100, 250, 500]; // TUNABLE (Phase 3) — band boundaries

/** Max ± jitter (in MP) applied per-ul to each boundary. Kept small vs. band gaps. */
export const BOUNDARY_JITTER_MP = 15; // TUNABLE (Phase 3) — per-ul transition spread

/**
 * A stable per-ul hash over identity fields that never change after birth (set points,
 * stubbornness, sex). FNV-1a over scaled-integer float bits — pure, deterministic, no entropy.
 * Same soul → same hash for its whole life, so its stage clock is fixed at birth.
 */
function soulHash(soul: Soul): number {
  let h = 0x811c9dc5; // FNV offset basis
  const mix = (x: number): void => {
    // Fold a float into the hash via a stable scaled-integer representation.
    const n = Math.round(x * 1e6) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= (n >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
    }
  };
  for (const aspect of ASPECTS) mix(soul.s[aspect]);
  mix(soul.stubbornness);
  mix(soul.sex === "male" ? 1 : 2);
  return h >>> 0;
}

/**
 * Deterministic per-ul, per-boundary jitter in [-BOUNDARY_JITTER_MP, +BOUNDARY_JITTER_MP].
 * Each boundary gets its own offset (an early-teen ul isn't forced to also age early
 * everywhere), but all are fixed at birth — so the same ul always crosses on the same clock.
 */
function boundaryJitter(soul: Soul, boundaryIndex: number): number {
  const h = (soulHash(soul) ^ Math.imul(boundaryIndex + 1, 0x9e3779b1)) >>> 0;
  const unit = h / 0xffffffff; // [0,1]
  return (unit * 2 - 1) * BOUNDARY_JITTER_MP;
}

/**
 * Map maturity points to a life stage. Without a `soul`, uses the plain fixed bands.
 * With a `soul`, applies that ul's stable per-boundary jitter — so some uls hit their
 * teen years earlier/harder, deterministically and for life.
 */
export function stageFromMp(mp: number, soul?: Soul): Stage {
  const [b0, b1, b2] = STAGE_BANDS;
  const j = (i: number): number => (soul ? boundaryJitter(soul, i) : 0);
  if (mp < b0 + j(0)) return "childhood";
  if (mp < b1 + j(1)) return "adolescence";
  if (mp < b2 + j(2)) return "early_adulthood";
  return "old_adulthood";
}

// ─────────────────────────────────────────────────────────────────────────────
// Aging — rate-capped MP accrual.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MP granted by a maximally-significant single accrual step, before the cap.
 * The significance→MP mapping detail is deferred (SPEC: "what counts as 1 MP"); this is a
 * clean bounded linear mapping over a normalized [0,1] significance.
 */
export const MP_PER_FULL_SESSION = 4; // TUNABLE (Phase 3) — significance→MP scale

/**
 * Hard ceiling on MP gained in a single accrual step. This is the anti-farming cap:
 * no matter how significant a session is rated, age can't jump more than this per step.
 * (True calendar-rate limiting — "real time AND real use both required" — is layered at
 * the plugin edge, which controls how often accrueMp is called; here we cap each step.)
 */
export const MP_STEP_CAP = 3; // TUNABLE (Phase 3) — per-step MP cap

/**
 * Rate-capped MP accrual. Returns the soul's NEW mp (pure — does not mutate).
 * `sessionSignificance` is clamped to [0,1]; the mapped gain is then capped at MP_STEP_CAP,
 * so age can never be rushed past the cap regardless of input.
 */
export function accrueMp(soul: Soul, sessionSignificance: number): number {
  const sig = Math.min(1, Math.max(0, sessionSignificance));
  const gain = Math.min(MP_STEP_CAP, sig * MP_PER_FULL_SESSION);
  return soul.mp + gain;
}
