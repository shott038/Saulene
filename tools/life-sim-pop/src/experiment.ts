/**
 * @saulene/life-sim-pop — experiment-design toolkit
 *
 * Four statistical tools for rigorous personality-sim experiments:
 *
 *  1. `crnPaired`     — common-random-number paired design: same seed + same script, vary
 *                       one knob at a time so per-life variance cancels. Determinism gives
 *                       CRN for free — no special treatment needed.
 *  2. `frozenSoulAB`  — same script against a drifting ul vs one frozen at birth; the
 *                       difference is a causal estimate of how much lived experience moved it.
 *  3. `latinHypercube` — LHS over (seed × script × knob) space: covers the hypercube with
 *                        far fewer runs than a full grid (N samples instead of N^K).
 *  4. `powerAnalysis`  — given observed effect + variance, how many lives for a target CI.
 */

import {
  ASPECTS,
  DEFAULT_KNOBS,
  type GlobalKnobs,
  type Soul,
  accrueMp,
  charge,
  chargeTension,
  consolidate,
  projectMbti,
  seedFromEntropy,
  stageFromMp,
  stageRules,
} from "@saulene/core";
import type { AspectVector, Stage } from "@saulene/core";
import { type ScriptedSession, entropyFromInt, lifetime } from "@saulene/simulator";
import { makeRng, shuffle } from "./rng.js";
import type { CrnPairedResult, FrozenABResult, LhsSample, PowerAnalysisResult } from "./types.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function l2(a: AspectVector, b: AspectVector): number {
  let sum = 0;
  for (const asp of ASPECTS) {
    const d = a[asp] - b[asp];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// ── 1. CRN paired design ──────────────────────────────────────────────────────

export interface CrnPairedOpts {
  seeds: readonly number[];
  /** The SAME session sequence for all pairs — variance from script is thus controlled. */
  sessions: readonly ScriptedSession[];
  knobA: GlobalKnobs;
  knobB: GlobalKnobs;
}

/**
 * Run each seed through knobA and knobB with the same session script. The same seed →
 * same ul → per-life variance is identical in both arms, so the difference in outcomes is
 * attributable solely to the knob change (classic CRN). No bookkeeping needed — determinism
 * already provides CRN for free.
 */
export function crnPaired(opts: CrnPairedOpts): CrnPairedResult[] {
  return opts.seeds.map((seedId) => {
    const entropy = entropyFromInt(seedId);
    const trajA = lifetime(entropy, opts.sessions, opts.knobA);
    const trajB = lifetime(entropy, opts.sessions, opts.knobB);
    return {
      seedId,
      vA: { ...trajA.final.v },
      vB: { ...trajB.final.v },
      delta: l2(trajA.final.v, trajB.final.v),
      breakCountA: trajA.breaks.length,
      breakCountB: trajB.breaks.length,
    };
  });
}

// ── 2. Frozen-soul A/B ────────────────────────────────────────────────────────

export interface FrozenSoulABOpts {
  seeds: readonly number[];
  sessions: readonly ScriptedSession[];
  knobs?: GlobalKnobs;
}

/**
 * For each seed, run two arms:
 *   A — Normal drifting life: full charge → consolidate pipeline.
 *   B — Frozen-at-birth control: the ul receives the same sessions but consolidate is
 *       skipped, so `v` never moves from its birth values. Charge/tension still accumulate
 *       (they need to for the loop to be faithful), but the commit step never fires.
 *
 * The L2 distance between vA and vB is `causalDrift`: the portion of the personality shift
 * that was CAUSED by lived experience, not pre-existing nature.
 */
export function frozenSoulAB(opts: FrozenSoulABOpts): FrozenABResult[] {
  const knobs = opts.knobs ?? DEFAULT_KNOBS;

  return opts.seeds.map((seedId) => {
    const entropy = entropyFromInt(seedId);

    // Arm A: normal drifting life.
    const drifting = lifetime(entropy, opts.sessions, knobs);

    // Arm B: frozen — same loop but consolidate is a no-op.
    const birth = seedFromEntropy(entropy, 0);
    let soul = birth;
    for (const sess of opts.sessions) {
      soul = charge(soul, sess.practice, knobs);
      soul = chargeTension(soul, { practice: sess.practice, fit: sess.fit }, knobs);
      soul = { ...soul, mp: accrueMp(soul, sess.significance) };
      // consolidate intentionally omitted — v never moves
    }

    return {
      seedId,
      vDrifting: { ...drifting.final.v },
      vFrozen: { ...birth.v },
      causalDrift: l2(drifting.final.v, birth.v),
    };
  });
}

// ── 3. Latin-hypercube sampling ───────────────────────────────────────────────

export interface KnobRange {
  min: number;
  max: number;
}

export interface LatinHypercubeOpts {
  /** Number of LHS samples to draw. */
  n: number;
  /** Pool of integer seeds to sample from. */
  seedPool: readonly number[];
  /** Number of scripts in the pool (index into the caller's script array). */
  scriptCount: number;
  /** Per-knob ranges to sweep. Only listed knobs are varied; others use `knobTemplate`. */
  knobRanges: Partial<Record<keyof GlobalKnobs, KnobRange>>;
  knobTemplate?: GlobalKnobs;
  /** Seed for the LHS shuffle itself. */
  rngSeed?: number;
}

/**
 * Latin-hypercube sampling over (seed × script × knobs).
 *
 * For N samples and K varying knob dimensions:
 *   - Divide each dimension into N equal strata.
 *   - Sample exactly once per stratum per dimension (uniform within the stratum).
 *   - Shuffle each dimension independently.
 * Result: N samples that cover every marginal uniformly with far fewer total runs than N^K.
 */
export function latinHypercube(opts: LatinHypercubeOpts): LhsSample[] {
  const { n, seedPool, scriptCount, knobTemplate, rngSeed = 0 } = opts;
  const rng = makeRng(rngSeed);

  // ── Seed dimension ──────────────────────────────────────────────────────────
  // Stratify over seedPool indices; sample one per stratum, map back to actual seed IDs.
  const seedIndices = Array.from({ length: n }, (_, i) => {
    const lo = (i * seedPool.length) / n;
    const hi = ((i + 1) * seedPool.length) / n;
    const idx = Math.floor(lo + rng.uniform() * (hi - lo));
    return Math.min(idx, seedPool.length - 1);
  });
  shuffle(seedIndices, rng);

  // ── Script dimension ────────────────────────────────────────────────────────
  const scriptIndices = Array.from({ length: n }, (_, i) => {
    const lo = (i * scriptCount) / n;
    const hi = ((i + 1) * scriptCount) / n;
    return Math.min(Math.floor(lo + rng.uniform() * (hi - lo)), scriptCount - 1);
  });
  shuffle(scriptIndices, rng);

  // ── Knob dimensions ─────────────────────────────────────────────────────────
  const knobKeys = Object.keys(opts.knobRanges) as (keyof GlobalKnobs)[];
  const knobColumns: Record<string, number[]> = {};

  for (const key of knobKeys) {
    const range = opts.knobRanges[key];
    if (!range) continue;
    const col = Array.from({ length: n }, (_, i) => {
      const lo = range.min + (i / n) * (range.max - range.min);
      const hi = range.min + ((i + 1) / n) * (range.max - range.min);
      return lo + rng.uniform() * (hi - lo);
    });
    shuffle(col, rng);
    knobColumns[key] = col;
  }

  const base = knobTemplate ?? DEFAULT_KNOBS;

  return Array.from({ length: n }, (_, i) => {
    const knobs: Record<string, number> = {};
    for (const key of knobKeys) {
      const col = knobColumns[key];
      if (col) knobs[key] = col[i] ?? base[key];
    }
    return {
      seedId: seedPool[seedIndices[i] ?? 0] ?? 0,
      scriptIdx: scriptIndices[i] ?? 0,
      knobs,
    };
  });
}

// ── 4. Power analysis ─────────────────────────────────────────────────────────

export interface PowerAnalysisOpts {
  /**
   * Observed effect size δ — the raw difference in means you want to detect.
   * Use the difference in `drift` or a per-aspect `v` gap from a pilot run.
   */
  observedEffect: number;
  /** Estimated variance σ² from the pilot (use sample variance of your pilot's metric). */
  observedVariance: number;
  /** Two-sided significance level. Default 0.05. */
  alpha?: number;
  /** Desired statistical power. Default 0.80. */
  targetPower?: number;
}

// Standard normal quantile via rational approximation (Abramowitz & Stegun 26.2.17).
function normInv(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError("normInv: p must be in (0, 1)");
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  // Named constants to avoid indexed access with noUncheckedIndexedAccess.
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d0 = 1.432788;
  const d1 = 0.189269;
  const d2 = 0.001308;
  const num = (c2 * t + c1) * t + c0;
  const den = ((d2 * t + d1) * t + d0) * t + 1;
  const x = t - num / den;
  return p < 0.5 ? -x : x;
}

/**
 * Two-sample t-test power analysis (equal group sizes, two-sided).
 *
 * Formula: n = 2σ²(z_{α/2} + z_β)² / δ²
 *
 * Example: pilot of 100 lives shows meanDrift differs by 0.03 with σ²=0.002.
 * `powerAnalysis({ observedEffect: 0.03, observedVariance: 0.002 })`
 * → how many lives per arm to detect this with 80% power at α=0.05.
 */
export function powerAnalysis(opts: PowerAnalysisOpts): PowerAnalysisResult {
  const { observedEffect, observedVariance, alpha = 0.05, targetPower = 0.8 } = opts;

  if (observedEffect <= 0) throw new RangeError("powerAnalysis: observedEffect must be > 0");
  if (observedVariance <= 0) throw new RangeError("powerAnalysis: observedVariance must be > 0");

  const zAlpha = normInv(1 - alpha / 2);
  const zBeta = normInv(targetPower);

  const nPerGroup = Math.ceil((2 * observedVariance * (zAlpha + zBeta) ** 2) / observedEffect ** 2);

  return {
    nPerGroup,
    nTotal: nPerGroup * 2,
    observedEffect,
    observedVariance,
    alpha,
    targetPower,
  };
}
