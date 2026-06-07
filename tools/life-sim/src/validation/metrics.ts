/**
 * @saulene/life-sim — validation metrics (Layer D)
 *
 * Four metrics that answer "does this feel like a person changing over a lifetime?":
 *
 *   1. crossTimeIdentity  — blind judge: same soul AND orderable in time?
 *   2. frozenSoulControlAB — drifting arm diverges from frozen arm?
 *   3. twoLivesOneSeed     — aligned vs grind from same seed → two felt adults a judge can tell apart?
 *   4. surrogateVsTruth    — pure-engine lifetime() matches the closed-loop trajectory?
 *
 * All pure aside from the injected async ValidationJudge. Metrics 1 and 3 need the judge;
 * metrics 2 and 4 are engine-level vector comparisons (no LLM).
 */

import { ASPECTS } from "@saulene/core";
import type { AspectVector } from "@saulene/core";
import type { Trajectory } from "@saulene/simulator";
import type { ClosedLoopResult, LifeSnapshot } from "../closed-loop.js";
import type { ValidationJudge } from "./judge.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Mean per-aspect absolute distance between two aspect vectors. */
function meanAspectDistance(a: AspectVector, b: AspectVector): number {
  let sum = 0;
  for (const aspect of ASPECTS) sum += Math.abs(a[aspect] - b[aspect]);
  return sum / ASPECTS.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 1 — Cross-time identity
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossTimeResult {
  /** Did the judge read both transcripts as the same entity? (continuity) */
  sameBeing: boolean;
  /** Did the judge correctly identify the early transcript as earlier? (perceptible change) */
  orderable: boolean;
  /** pass iff sameBeing AND orderable — the full cross-time identity contract. */
  pass: boolean;
  confidence: "low" | "med" | "high";
  reasoning: string;
  /** Session indices used for comparison. */
  earlySessionIndex: number;
  lateSessionIndex: number;
}

/**
 * Cross-time identity: given an early and a late snapshot from the same life, ask a blind judge:
 *   (1) "same soul at different ages?" → continuity
 *   (2) "which transcript is earlier?" → perceptible change
 *
 * Pass iff both conditions hold: the life reads as ONE CONTINUOUS BEING who has visibly changed.
 *
 * The early snapshot is passed as transcript A; orderable=true when the judge returns earlierIs='A'.
 */
export async function crossTimeIdentity(
  early: LifeSnapshot,
  late: LifeSnapshot,
  judge: ValidationJudge,
): Promise<CrossTimeResult> {
  const verdict = await judge.sameBeingOverTime(early.transcript.text, late.transcript.text);
  const orderable = verdict.earlierIs === "A";
  return {
    sameBeing: verdict.sameBeing,
    orderable,
    pass: verdict.sameBeing && orderable,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
    earlySessionIndex: early.sessionIndex,
    lateSessionIndex: late.sessionIndex,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 2 — Frozen-soul control A/B
// ─────────────────────────────────────────────────────────────────────────────

export interface FrozenSoulResult {
  driftingFinalV: AspectVector;
  frozenFinalV: AspectVector;
  /** Mean per-aspect |drifting_v − frozen_v| at the final session. */
  vDistance: number;
  /** Per-snapshot vDistance (aligned by sessionIndex). */
  snapshotDistances: number[];
  /** True when the drifting arm has diverged from the frozen arm beyond the threshold. */
  diverges: boolean;
  threshold: number;
}

/** Minimum mean per-aspect divergence for the drifting arm to "count" as having drifted. */
export const FROZEN_DIVERGENCE_THRESHOLD = 0.02;

/**
 * Frozen-soul control A/B: given two runs of the same life (one drifting, one frozen at birth),
 * measure that the drifting arm diverges from the frozen arm beyond the threshold.
 *
 * No LLM needed — pure vector comparison.
 */
export function frozenSoulControlAB(
  drifting: ClosedLoopResult,
  frozen: ClosedLoopResult,
  threshold = FROZEN_DIVERGENCE_THRESHOLD,
): FrozenSoulResult {
  const vDistance = meanAspectDistance(drifting.final.v, frozen.final.v);

  // Align per-snapshot distances by session index.
  const frozenBySession = new Map(frozen.snapshots.map((s) => [s.sessionIndex, s.soul.v]));
  const snapshotDistances = drifting.snapshots.map((snap) => {
    const frozenV = frozenBySession.get(snap.sessionIndex) ?? frozen.birth.v;
    return meanAspectDistance(snap.soul.v, frozenV);
  });

  return {
    driftingFinalV: drifting.final.v,
    frozenFinalV: frozen.final.v,
    vDistance,
    snapshotDistances,
    diverges: vDistance >= threshold,
    threshold,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 3 — Two-lives-one-seed
// ─────────────────────────────────────────────────────────────────────────────

export interface TwoLivesResult {
  /** Judge verdict: are these two transcripts from different people? */
  distinguishable: boolean;
  explanation: string;
  confidence: "low" | "med" | "high";
  /** Mean per-aspect |aligned_v − grind_v| at the final session (engine sanity check). */
  vDistance: number;
  /** pass iff distinguishable AND vDistance >= vThreshold. */
  pass: boolean;
  threshold: number;
}

/** Minimum engine-level divergence for the two lives to "count" as separate. */
export const TWO_LIVES_V_THRESHOLD = 0.02;

/**
 * Two-lives-one-seed: from the same seed, run an aligned-user life and a grind-user life.
 * A blind judge must be able to tell the two final transcripts apart AND the engine v-vectors
 * must have diverged beyond the threshold.
 *
 * This is the CLI-in-the-loop sibling of the engine-layer acceptance test in
 * tools/simulator/test/acceptance.test.ts.
 */
export async function twoLivesOneSeed(
  alignedLife: ClosedLoopResult,
  grindLife: ClosedLoopResult,
  judge: ValidationJudge,
  vThreshold = TWO_LIVES_V_THRESHOLD,
): Promise<TwoLivesResult> {
  const vDistance = meanAspectDistance(alignedLife.final.v, grindLife.final.v);

  const alignedLast = alignedLife.snapshots.at(-1);
  const grindLast = grindLife.snapshots.at(-1);

  if (!alignedLast || !grindLast) {
    return {
      distinguishable: false,
      explanation: "No snapshots — cannot judge.",
      confidence: "low",
      vDistance,
      pass: false,
      threshold: vThreshold,
    };
  }

  const verdict = await judge.distinguishable(
    alignedLast.transcript.text,
    grindLast.transcript.text,
  );

  return {
    distinguishable: verdict.distinguishable,
    explanation: verdict.explanation,
    confidence: verdict.confidence,
    vDistance,
    pass: verdict.distinguishable && vDistance >= vThreshold,
    threshold: vThreshold,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 4 — Surrogate-vs-truth check
// ─────────────────────────────────────────────────────────────────────────────

export interface SurrogateCheckResult {
  closedLoopFinalV: AspectVector;
  /** The pure-engine surrogate prediction's final v. */
  surrogateFinalV: AspectVector;
  /** Mean per-aspect |closed_loop_v − surrogate_v|. Lower = better prediction. */
  meanVError: number;
  /** Per-snapshot mean v error (aligned by session index, best-effort). */
  snapshotErrors: number[];
  /** True when meanVError <= threshold — surrogate matches the expensive truth. */
  matches: boolean;
  threshold: number;
}

/**
 * Generous threshold — the surrogate (scripted or corpus-sampled) is only a statistical
 * approximation; it won't match the closed-loop truth exactly. This threshold checks that
 * they're in the same ballpark.
 */
export const SURROGATE_ERROR_THRESHOLD = 0.3;

/**
 * Surrogate-vs-truth: compare a golden closed-loop life's trajectory against the cheap
 * prediction produced by lifetime() with scripted (or corpus-sampled) sessions.
 *
 * No LLM needed — pure vector comparison.
 *
 * Note: if the sibling W2 (life-sim-pop) isn't merged, pass a lifetime() trajectory with
 * hand-crafted scripted sessions as the surrogate; leave a TODO to swap in the empirical sim.
 */
export function surrogateVsTruth(
  closedLoop: ClosedLoopResult,
  surrogateTraj: Trajectory,
  threshold = SURROGATE_ERROR_THRESHOLD,
): SurrogateCheckResult {
  const surrogateFinalV = surrogateTraj.final.v;
  const meanVError = meanAspectDistance(closedLoop.final.v, surrogateFinalV);

  // Align per-snapshot errors by session index (best-effort — the two runs may have different
  // session counts; unmatched closed-loop snapshots fall back to the final error).
  const surSnapBySession = new Map(surrogateTraj.snapshots.map((s) => [s.session, s.v]));
  const snapshotErrors = closedLoop.snapshots.map((snap) => {
    const surV = surSnapBySession.get(snap.sessionIndex);
    return surV ? meanAspectDistance(snap.soul.v, surV) : meanVError;
  });

  return {
    closedLoopFinalV: closedLoop.final.v,
    surrogateFinalV,
    meanVError,
    snapshotErrors,
    matches: meanVError <= threshold,
    threshold,
  };
}
