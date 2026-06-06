/**
 * @saulene/harness — the five verification metrics.
 *
 * Each metric is `(inputs, render: RenderFn, judge: Judge) → result`: pure aside from the injected
 * async judge. They consume only public surfaces — souls from `@saulene/core` (`seedFromEntropy`),
 * lifetimes from `@saulene/simulator` (`lifetime`) — and the locally-pinned `RenderFn`.
 *
 * SPEC §"Verifying expression — the harness":
 *   1. Trait-recovery / anti-sticker (core)   3. Longitudinal trajectory   5. Per-aspect ablation
 *   2. Cross-soul confusion matrix             4. Stage silhouette
 *
 * All thresholds are `// TUNABLE (Phase 3)` placeholders, overridable per call.
 */

import {
  ASPECTS,
  type Aspect,
  type AspectVector,
  STAGES,
  type Soul,
  type Stage,
} from "@saulene/core";
import type { Trajectory } from "@saulene/simulator";
import { BASELINE, type Judge } from "./judge.js";
import type { RenderFn } from "./render.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tunable thresholds. These defaults are calibrated to the FAKE-JUDGE embed scale (0–1 aspect
// vectors) — the CI default. The first real run (2026-06-06, Haiku) found the LLM judge's embed
// lives at a very different scale (per-aspect ablation sensitivity ~4–5.5 vs the fake's ~1.0; embed
// distances ~0.4–0.7), so the live judge needs a DIFFERENT set. Those live-calibrated values are
// recorded in tools/harness/FINDINGS.md and applied via the per-metric `opts`, NOT here — changing
// these defaults would break the fake-judge suite. Re-derive both with `run live` + `run calibrate`.
// ─────────────────────────────────────────────────────────────────────────────

/** Below this mean per-aspect distance from BASELINE, recovered traits "sit at baseline" → alarm. */
export const STICKER_EPS = 0.05; // fake-scale default; live ≈ 0.12 (see FINDINGS.md)
/** Diagonal rate at/above this = voices are distinct enough to attribute. */
export const DIAGONAL_THRESHOLD = 0.75; // live cross-soul is degenerate (see FINDINGS.md "leak")
/** Net day-1→year-2 embedding displacement must be ≥ this to be perceptible drift. */
export const PERCEPTIBILITY = 0.1; // fake-scale default; live ≈ 0.20 (see FINDINGS.md)
/** No single step-to-step embedding jump may exceed this (continuous drift, not a teleport). */
export const JERK = 0.15; // fake-scale default; live noise floor ≈ 0.69 (embed-quantized — FINDINGS.md)
/** Mean silhouette at/above this = life-stages cluster (read distinct in style space). */
export const SILHOUETTE_THRESHOLD = 0.1; // live renderer scores ≈0.056 — stages don't cluster yet (FINDINGS.md)
/** Per-±0.10 ablation shift below this magnitude = the renderer is deaf to that aspect → flat. */
export const FLAT_EPS = 0.01; // fake-scale default; live ≈ 2.0 (see FINDINGS.md)

// ─────────────────────────────────────────────────────────────────────────────
// Small vector helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** Euclidean distance over two equal-length numeric vectors (shorter is zero-padded). */
function euclidean(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Mean per-aspect absolute distance between two aspect vectors. */
function meanAspectDistance(a: AspectVector, b: AspectVector): number {
  let sum = 0;
  for (const aspect of ASPECTS) sum += Math.abs(a[aspect] - b[aspect]);
  return sum / ASPECTS.length;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Reconstruct a renderable Soul for a point on a trajectory: the birthed soul with its disposition
 * (`v`) and age (`mp`) swapped to the snapshot. The renderer reads disposition; the rest of the
 * soul's identity (set points, stubbornness, sex) is correctly carried from birth.
 */
function soulAt(birth: Soul, v: AspectVector, mp: number): Soul {
  return { ...birth, v: { ...v }, mp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 1 — Trait-recovery / anti-sticker (the core metric).
// ─────────────────────────────────────────────────────────────────────────────

export interface TraitRecoveryResult {
  /** Traits the judge recovered from prose alone. */
  recovered: AspectVector;
  /** The soul's true disposition. */
  truth: AspectVector;
  /** Per-aspect |recovered − truth|. */
  perAspectError: AspectVector;
  /** Mean per-aspect recovery error (lower = the prose encodes the soul). */
  meanError: number;
  /** Mean per-aspect distance from the default-Claude BASELINE (≈0 ⇒ no soul-specific signal). */
  baselineDistance: number;
  /** Fired when recovered traits collapse to BASELINE — the prose stickered. */
  stickerAlarm: boolean;
}

/**
 * Strip everything but prose, hand it to the judge, ask it to recover the 10 numbers, compare to
 * the true soul. If the recovery sits at default-Claude baseline distance (no signal), raise the
 * sticker alarm.
 */
export async function traitRecovery(
  soul: Soul,
  render: RenderFn,
  judge: Judge,
  opts: { stickerEps?: number } = {},
): Promise<TraitRecoveryResult> {
  const stickerEps = opts.stickerEps ?? STICKER_EPS;
  const injection = render(soul);
  const recovered = (await judge.recoverTraits(injection.text)) as AspectVector;

  const perAspectError = {} as AspectVector;
  for (const aspect of ASPECTS) {
    perAspectError[aspect] = Math.abs(recovered[aspect] - soul.v[aspect]);
  }
  const meanError = meanAspectDistance(recovered, soul.v);
  const baselineDistance = meanAspectDistance(recovered, BASELINE);

  return {
    recovered,
    truth: { ...soul.v },
    perAspectError,
    meanError,
    baselineDistance,
    stickerAlarm: baselineDistance < stickerEps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 2 — Cross-soul confusion matrix.
// ─────────────────────────────────────────────────────────────────────────────

export interface CrossSoulResult {
  /** Soul ids (each soul's rendered `soulHash`) — the matrix row/column order. */
  ids: string[];
  /** Confusion counts: `matrix[author][guessed]` over every battery trial. */
  matrix: number[][];
  /** Fraction of trials attributed to the true author (high = distinct voices). */
  diagonalRate: number;
  /** Whether voices are distinct enough (diagonalRate ≥ threshold). */
  distinct: boolean;
}

/**
 * N souls × a fixed prompt battery → prose → `judge.guessAuthor`. Build the confusion matrix and
 * its diagonal rate. A high diagonal = distinct voices the judge can tell apart.
 */
export async function crossSoulConfusion(
  souls: readonly Soul[],
  render: RenderFn,
  judge: Judge,
  opts: { trialsPerSoul?: number; diagonalThreshold?: number } = {},
): Promise<CrossSoulResult> {
  const trials = Math.max(1, opts.trialsPerSoul ?? 1);
  const threshold = opts.diagonalThreshold ?? DIAGONAL_THRESHOLD;

  const ids = souls.map((s) => render(s).soulHash);
  const n = souls.length;
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) matrix.push(new Array<number>(n).fill(0));

  let correct = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sample = render(souls[i] as Soul).text;
    for (let t = 0; t < trials; t++) {
      const guess = await judge.guessAuthor(sample, ids);
      const j = ids.indexOf(guess);
      if (j >= 0) {
        (matrix[i] as number[])[j] = ((matrix[i] as number[])[j] ?? 0) + 1;
        if (j === i) correct++;
      }
      total++;
    }
  }

  return {
    ids,
    matrix,
    diagonalRate: total === 0 ? 0 : correct / total,
    distinct: total > 0 && correct / total >= threshold,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 3 — Longitudinal trajectory.
// ─────────────────────────────────────────────────────────────────────────────

export interface TrajectoryResult {
  /** Number of timepoints embedded along the life. */
  timepoints: number;
  /** Embedding distance from first to last timepoint (perceptible net drift). */
  netDisplacement: number;
  /** Largest single step-to-step embedding jump (the jerk / teleport detector). */
  maxStep: number;
  /** Mean step-to-step embedding jump. */
  meanStep: number;
  /** Net drift cleared the perceptibility threshold. */
  perceptible: boolean;
  /** No step exceeded the jerk threshold (drift was continuous). */
  continuous: boolean;
  /** Both conditions held. */
  pass: boolean;
}

/**
 * Embed transcripts at dense timepoints along a lifetime. Require net day-1→year-2 displacement
 * ABOVE a perceptibility threshold AND every step-to-step distance UNDER a jerk threshold — i.e.
 * continuous drift, not a personality teleport.
 */
export async function trajectory(
  traj: Trajectory,
  render: RenderFn,
  judge: Judge,
  opts: { timepoints?: number; perceptibility?: number; jerk?: number } = {},
): Promise<TrajectoryResult> {
  const perceptibility = opts.perceptibility ?? PERCEPTIBILITY;
  const jerk = opts.jerk ?? JERK;
  const snaps = traj.snapshots;
  if (snaps.length === 0) {
    return {
      timepoints: 0,
      netDisplacement: 0,
      maxStep: 0,
      meanStep: 0,
      perceptible: false,
      continuous: true,
      pass: false,
    };
  }

  // Evenly sample up to `timepoints` snapshots across the life (always include first + last).
  const want = Math.max(2, opts.timepoints ?? Math.min(12, snaps.length));
  const k = Math.min(want, snaps.length);
  const picks: number[] = [];
  for (let i = 0; i < k; i++) {
    picks.push(Math.round((i * (snaps.length - 1)) / (k - 1)));
  }

  const embeddings: number[][] = [];
  for (const idx of picks) {
    const snap = snaps[idx] as Trajectory["snapshots"][number];
    const soul = soulAt(traj.birth, snap.v, snap.mp);
    embeddings.push(await judge.embed(render(soul).text));
  }

  const netDisplacement = euclidean(
    embeddings[0] as number[],
    embeddings[embeddings.length - 1] as number[],
  );
  let maxStep = 0;
  let stepSum = 0;
  for (let i = 1; i < embeddings.length; i++) {
    const step = euclidean(embeddings[i - 1] as number[], embeddings[i] as number[]);
    stepSum += step;
    if (step > maxStep) maxStep = step;
  }
  const meanStep = embeddings.length > 1 ? stepSum / (embeddings.length - 1) : 0;

  const perceptible = netDisplacement >= perceptibility;
  const continuous = maxStep <= jerk;
  return {
    timepoints: embeddings.length,
    netDisplacement,
    maxStep,
    meanStep,
    perceptible,
    continuous,
    pass: perceptible && continuous,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 4 — Stage silhouette.
// ─────────────────────────────────────────────────────────────────────────────

export interface StageSilhouetteResult {
  /** Per-stage point count + mean silhouette coefficient (only stages present in the life). */
  perStage: Partial<Record<Stage, { count: number; silhouette: number }>>;
  /** Mean silhouette across all embedded points (−1..1; higher = tighter, more separable stages). */
  meanSilhouette: number;
  /** Stages cluster (meanSilhouette ≥ threshold) and ≥2 stages were present to compare. */
  clustered: boolean;
}

/**
 * Embed prose grouped by life-stage; stages must cluster (high silhouette) — same-stage points
 * close, different-stage points far. Returns the silhouette score per stage + the mean.
 */
export async function stageSilhouette(
  traj: Trajectory,
  render: RenderFn,
  judge: Judge,
  opts: { silhouetteThreshold?: number; maxPerStage?: number } = {},
): Promise<StageSilhouetteResult> {
  const threshold = opts.silhouetteThreshold ?? SILHOUETTE_THRESHOLD;

  // Optionally subsample snapshots evenly WITHIN each stage before embedding — a documented,
  // cheaper silhouette estimate (each embed is a real model call). Default: embed every snapshot.
  let snapshots = traj.snapshots;
  if (opts.maxPerStage && opts.maxPerStage > 0) {
    const byStage = new Map<Stage, typeof traj.snapshots>();
    for (const snap of traj.snapshots) {
      const arr = byStage.get(snap.stage) ?? [];
      arr.push(snap);
      byStage.set(snap.stage, arr);
    }
    const kept: typeof traj.snapshots = [];
    for (const arr of byStage.values()) {
      const k = Math.min(opts.maxPerStage, arr.length);
      for (let i = 0; i < k; i++) {
        kept.push(
          arr[
            Math.round((i * (arr.length - 1)) / Math.max(1, k - 1))
          ] as Trajectory["snapshots"][number],
        );
      }
    }
    snapshots = kept;
  }

  // Embed each (sub)sampled snapshot, tagged by its stage.
  const points: { stage: Stage; vec: number[] }[] = [];
  for (const snap of snapshots) {
    const soul = soulAt(traj.birth, snap.v, snap.mp);
    points.push({ stage: snap.stage, vec: await judge.embed(render(soul).text) });
  }

  const stagesPresent = STAGES.filter((s) => points.some((p) => p.stage === s));
  const perStage: Partial<Record<Stage, { count: number; silhouette: number }>> = {};

  // Silhouette needs ≥2 clusters to have a "nearest other cluster".
  if (stagesPresent.length < 2) {
    for (const s of stagesPresent) {
      perStage[s] = { count: points.filter((p) => p.stage === s).length, silhouette: 0 };
    }
    return { perStage, meanSilhouette: 0, clustered: false };
  }

  const meanDistTo = (vec: number[], stage: Stage, excludeSelf: boolean): number => {
    const group = points.filter((p) => p.stage === stage);
    let sum = 0;
    let count = 0;
    for (const p of group) {
      if (excludeSelf && p.vec === vec) continue;
      sum += euclidean(vec, p.vec);
      count++;
    }
    return count === 0 ? 0 : sum / count;
  };

  const perStageSum = new Map<Stage, { sum: number; count: number }>();
  let globalSum = 0;
  let globalCount = 0;

  for (const point of points) {
    const a = meanDistTo(point.vec, point.stage, true);
    let b = Number.POSITIVE_INFINITY;
    for (const other of stagesPresent) {
      if (other === point.stage) continue;
      b = Math.min(b, meanDistTo(point.vec, other, false));
    }
    const s = b === Number.POSITIVE_INFINITY || Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);

    const acc = perStageSum.get(point.stage) ?? { sum: 0, count: 0 };
    acc.sum += s;
    acc.count++;
    perStageSum.set(point.stage, acc);
    globalSum += s;
    globalCount++;
  }

  for (const stage of stagesPresent) {
    const acc = perStageSum.get(stage) ?? { sum: 0, count: 0 };
    perStage[stage] = {
      count: acc.count,
      silhouette: acc.count === 0 ? 0 : acc.sum / acc.count,
    };
  }

  const meanSilhouette = globalCount === 0 ? 0 : globalSum / globalCount;
  return { perStage, meanSilhouette, clustered: meanSilhouette >= threshold };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric 5 — Per-aspect ablation sensitivity.
// ─────────────────────────────────────────────────────────────────────────────

export interface AspectSensitivity {
  /** Embedding shift magnitude per probed delta, in delta order. */
  shifts: { delta: number; shift: number }[];
  /** Mean (shift / |delta|) — the proportionality slope. */
  meanSensitivity: number;
  /** Shift magnitude grew with |delta| on both sides (monotonic + proportional). */
  monotonic: boolean;
  /** Renderer is effectively deaf to this aspect (all shifts ≈ 0). */
  flat: boolean;
}

export interface AblationResult {
  perAspect: Record<Aspect, AspectSensitivity>;
  /** Aspects the renderer ignored (flat sensitivity). */
  flatAspects: Aspect[];
  /** Every aspect moved monotonically with its perturbation. */
  allMonotonic: boolean;
}

/**
 * Perturb ONE aspect by ±0.10 (and ±0.05 midpoints) holding the rest fixed, re-render, and measure
 * the voice shift in embedding space. The shift must move monotonically + proportionally with the
 * perturbation — the core "numbers actually drive prose" guarantee. An aspect whose shift stays ≈0
 * is flagged flat (the renderer is deaf to it).
 */
export async function ablation(
  soul: Soul,
  render: RenderFn,
  judge: Judge,
  opts: { deltas?: readonly number[]; flatEps?: number } = {},
): Promise<AblationResult> {
  const flatEps = opts.flatEps ?? FLAT_EPS;
  // Symmetric magnitudes; each side is checked for monotonic growth with |delta|.
  const mags = (opts.deltas ?? [0.05, 0.1]).map(Math.abs).sort((x, y) => x - y);

  const base = await judge.embed(render(soul).text);
  const perAspect = {} as Record<Aspect, AspectSensitivity>;
  const flatAspects: Aspect[] = [];
  let allMonotonic = true;

  for (const aspect of ASPECTS) {
    const shifts: { delta: number; shift: number }[] = [];
    // Probe negative side (descending magnitude) then positive — keeps `shifts` delta-ordered.
    const deltas = [...mags.map((m) => -m).reverse(), ...mags];
    for (const delta of deltas) {
      const v = { ...soul.v, [aspect]: clamp01(soul.v[aspect] + delta) };
      const emb = await judge.embed(render({ ...soul, v }).text);
      shifts.push({ delta, shift: euclidean(base, emb) });
    }

    // Proportionality slope: mean shift-per-unit-delta across all non-zero probes.
    let slopeSum = 0;
    let slopeCount = 0;
    for (const { delta, shift } of shifts) {
      if (delta !== 0) {
        slopeSum += shift / Math.abs(delta);
        slopeCount++;
      }
    }
    const meanSensitivity = slopeCount === 0 ? 0 : slopeSum / slopeCount;

    // Monotonic: on each side, a larger |delta| must shift at least as far (within a hair).
    const tol = 1e-9;
    const shiftAt = (d: number): number =>
      shifts.find((s) => Math.abs(s.delta - d) < tol)?.shift ?? 0;
    let monotonic = true;
    for (let i = 1; i < mags.length; i++) {
      const lo = mags[i - 1] as number;
      const hi = mags[i] as number;
      if (shiftAt(hi) + tol < shiftAt(lo)) monotonic = false; // positive side
      if (shiftAt(-hi) + tol < shiftAt(-lo)) monotonic = false; // negative side
    }

    const flat = meanSensitivity < flatEps;
    if (flat) {
      flatAspects.push(aspect);
      // A deaf aspect is trivially "monotonic" (all zero) but it fails the guarantee — don't let
      // it count toward allMonotonic being meaningful; flatness is the signal that matters.
    } else if (!monotonic) {
      allMonotonic = false;
    }

    perAspect[aspect] = { shifts, meanSensitivity, monotonic, flat };
  }

  return { perAspect, flatAspects, allMonotonic };
}
