/**
 * @saulene/core — mbti
 *
 * Pure, display-only MBTI projection: the 10 Big Five aspects → a coarse 16-label readout.
 * MBTI is NOT engine truth (Peterson is anti-MBTI; the aspects are the truth). This layer
 * exists only so we can *score* birth seeding against real-world MBTI rarities.
 *
 * The rarity lives in the THRESHOLDS, not the aspects. Each dichotomy maps from an
 * aspect-SUM, and the cut is placed at the SPEC population percentile — derived in closed
 * form from the seeding model, never a flat 0.5 (see deriveCut below).
 */

import { SEEDING, WITHIN_DOMAIN_CORR } from "../birth/index.js";
import type { Aspect, AspectVector } from "../state/index.js";

export type MbtiLabel =
  | "ISTJ"
  | "ISFJ"
  | "INFJ"
  | "INTJ"
  | "ISTP"
  | "ISFP"
  | "INFP"
  | "INTP"
  | "ESTP"
  | "ESFP"
  | "ENFP"
  | "ENTP"
  | "ESTJ"
  | "ESFJ"
  | "ENFJ"
  | "ENTJ";

// ── Threshold derivation ────────────────────────────────────────────────────
//
// Each dichotomy is decided by the SUM of two aspects from the SAME Big-Five domain. Per sex,
// every aspect is Gaussian with mean 0.5 ± shift (shift = ½·d·σ, signed by sex × femaleSign)
// and spread σ. The two aspects of a sum are correlated at WITHIN_DOMAIN_CORR (ρ), so the sum
// is Gaussian with
//     σ_sum = √(σ₁² + σ₂² + 2·ρ·σ₁·σ₂)   (same for both sexes; sex only moves the mean)
//     ♀ mean = 1 + δ ,  ♂ mean = 1 − δ ,  δ = femaleSign₁·shift₁ + femaleSign₂·shift₂
// (cross-domain correlations don't touch a single sum's marginal, only the joint type freqs.)
//
// The population is a 50/50 MIXTURE of the ♀ and ♂ clusters, so the cut is the value c
// where the MIXTURE CDF equals the target lower-percentile p (= 1 − topFraction):
//     ½·Φ((c−♀mean)/σ_sum) + ½·Φ((c−♂mean)/σ_sum) = p
// We solve that for c by bisection (mixture CDF is monotone). For E/I, S/N, J/P the two
// cluster means are <0.02 apart so the mixture ≈ one Gaussian; for T/F they are ~0.13 apart
// (Compassion & Politeness are the most gender-dimorphic), so the mixture solve matters.
//
// Closed-form mean/σ this yields (with ρ = 0.22; σ_sum, ♀/♂ means, then the solved cut):
//   E/I  Enthusiasm+Assertiveness  σ=.1962  ♀1.0112/♂0.9889  top 49.3% → c≈1.0034
//   S/N  Openness+Intellect        σ=.2187  ♀1.0035/♂0.9965  top 26.7% → c≈1.1360  (the big skew)
//   T/F  Compassion+Politeness      σ=.2578  ♀1.0671/♂0.9330  top 60.0% → c≈0.9324  (F=high)
//   J/P  Industriousness+Orderlin.  σ=.1797  ♀1.0108/♂0.9892  top 54.1% → c≈0.9815  (J=high)
//
// If projected rarities drift, retune the COVARIANCE in ../birth or the cut derivation HERE,
// never the σ table.

/** Standard normal CDF via an Abramowitz-Stegun erf approximation (~1e-7 accuracy). */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Cut on `aspect1 + aspect2` such that the top `topFraction` of the seeded population
 * (the 50/50 sex mixture) lands above it. Returns the value c; the "high" pole is `sum > c`.
 */
function deriveCut(aspect1: Aspect, aspect2: Aspect, topFraction: number): number {
  const a = SEEDING[aspect1];
  const b = SEEDING[aspect2];
  // Both aspects share a domain → correlated at ρ; variance of the sum includes 2ρσ₁σ₂.
  const sigmaSum = Math.sqrt(
    a.sigma * a.sigma + b.sigma * b.sigma + 2 * WITHIN_DOMAIN_CORR * a.sigma * b.sigma,
  );
  const delta = a.femaleSign * 0.5 * a.d * a.sigma + b.femaleSign * 0.5 * b.d * b.sigma;
  const femaleMean = 1 + delta;
  const maleMean = 1 - delta;
  const p = 1 - topFraction; // target cumulative mass below the cut

  const mixtureCdf = (c: number): number =>
    0.5 * normalCdf((c - femaleMean) / sigmaSum) + 0.5 * normalCdf((c - maleMean) / sigmaSum);

  // Bisection on c ∈ [0, 2] (the sum is bounded to [0,2] by per-aspect clamping).
  let lo = 0;
  let hi = 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (mixtureCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The four derived cuts (SPEC table 4 splits). Computed once at module load from the
 * seeding model above — not magic numbers, not flat 0.5s.
 */
export const MBTI_CUTS = {
  /** E/I from Enthusiasm+Assertiveness — E is the top 49.3%. */
  EI: deriveCut("enthusiasm", "assertiveness", 0.493),
  /** S/N from Openness+Intellect — N is the top 26.7% (the rarity-driving skew). */
  SN: deriveCut("openness", "intellect", 0.267),
  /** T/F from Compassion+Politeness — F is the top 60% (mixture solve matters here). */
  TF: deriveCut("compassion", "politeness", 0.6),
  /** J/P from Industriousness+Orderliness — J is the top 54.1%. */
  JP: deriveCut("industriousness", "orderliness", 0.541),
} as const;

/** Project a soul's aspect vector to its display-only 16-type MBTI label. */
export function projectMbti(v: AspectVector): MbtiLabel {
  const ei = v.enthusiasm + v.assertiveness > MBTI_CUTS.EI ? "E" : "I";
  const sn = v.openness + v.intellect > MBTI_CUTS.SN ? "N" : "S";
  const tf = v.compassion + v.politeness > MBTI_CUTS.TF ? "F" : "T";
  const jp = v.industriousness + v.orderliness > MBTI_CUTS.JP ? "J" : "P";
  return `${ei}${sn}${tf}${jp}` as MbtiLabel;
}
