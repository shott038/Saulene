/**
 * @saulene/core — birth
 *
 * Birth seeding: research-grounded set points (Big Five Aspect Scale distributions,
 * Weisberg/DeYoung/Hirsh 2011) — per-aspect Gaussians, gender-shifted means, 50/50 sex,
 * a Big-Five covariance structure, and a random stubborn↔clay position. Produces a fresh
 * Soul from injected entropy.
 *
 * PURE on purpose: takes entropy bytes as an argument (the plugin supplies real
 * randomness). Same entropy in → same soul out, so births are replayable. No Date.now /
 * Math.random / new Date anywhere — the clock (`now`) is injected too.
 */

import { ASPECTS, type Aspect, type AspectVector, type Sex, type Soul } from "../state/index.js";

/**
 * Per-aspect seeding parameters (SPEC §"Birth seeding distribution", tables 2 & 3).
 *   sigma      — Gaussian spread; set by the study's gender effect sizes.
 *   d          — gender effect size (Cohen's d); drives the mean shift magnitude.
 *   femaleSign — +1 if FEMALE seeds higher, −1 if MALE seeds higher, 0 if undirected.
 *
 * Mean shift per soul = ±½·d in σ units = `0.5 * d * sigma`, signed by sex × femaleSign.
 * FEMALE higher: Compassion, Withdrawal, Politeness, Volatility, Openness, Enthusiasm, Orderliness.
 * MALE higher:   Intellect, Assertiveness.
 * Industriousness has no documented sex direction (d≈.06, negligible) → femaleSign 0.
 *
 * NOTE (load-bearing): the MBTI threshold derivation in ../mbti reads THIS table to compute
 * the analytic mean/σ of each aspect-sum. If you retune rarities, tune the COVARIANCE below
 * or the cut derivation — never this σ table (it's the research ground truth).
 */
export interface SeedParam {
  readonly sigma: number;
  readonly d: number;
  readonly femaleSign: -1 | 0 | 1;
}

export const SEEDING: Readonly<Record<Aspect, SeedParam>> = {
  openness: { sigma: 0.14, d: 0.27, femaleSign: 1 },
  intellect: { sigma: 0.14, d: 0.22, femaleSign: -1 },
  industriousness: { sigma: 0.11, d: 0.06, femaleSign: 0 },
  orderliness: { sigma: 0.12, d: 0.18, femaleSign: 1 },
  enthusiasm: { sigma: 0.14, d: 0.23, femaleSign: 1 },
  assertiveness: { sigma: 0.11, d: 0.09, femaleSign: -1 },
  compassion: { sigma: 0.17, d: 0.45, femaleSign: 1 },
  politeness: { sigma: 0.16, d: 0.36, femaleSign: 1 },
  withdrawal: { sigma: 0.16, d: 0.4, femaleSign: 1 },
  volatility: { sigma: 0.15, d: 0.3, femaleSign: 1 },
};

// ── Big-Five covariance ──────────────────────────────────────────────────────
//
// The 50/50 sex mixture alone supplies almost NO cross-dichotomy correlation (Openness↑♀
// and Intellect↑♂ cancel, so N is sex-neutral). With independent aspects, the projected MBTI
// types come out as the *product* of the marginals (INFJ ≈ 4.4% vs the 1.5% target). Real MBTI
// is strongly correlated — iNtuitives skew Perceiving, Sensors cluster as SJ — which is the
// real Big-Five fact that Openness/Intellect are negatively correlated with Conscientiousness.
//
// So we draw the 10 aspects as a *correlated* Gaussian: standard normals → Cholesky(R) → scale
// by σ, add the gender-shifted mean. This leaves every MARGINAL (the σ table) untouched and
// only adds off-diagonal structure. R is built from two knobs, tuned against the 10k rarity
// test (this is the lever to retune, NOT the σ table):
//   • WITHIN_DOMAIN_CORR — correlation between the two aspects of one Big-Five domain.
//   • CROSS_DOMAIN_CORR  — correlation between aspects of different domains (the C↔O = −0.31
//     term is what drives the N↔J anti-correlation that makes intuitive-Judging types rare).
// Domains: O = Openness/Intellect, C = Conscientiousness (Industriousness/Orderliness),
//          E = Extraversion (Enthusiasm/Assertiveness), A = Agreeableness (Compassion/Politeness),
//          N = Neuroticism (Withdrawal/Volatility; unused by MBTI, left cross-uncorrelated).

type Domain = "O" | "C" | "E" | "A" | "N";

const DOMAIN: Readonly<Record<Aspect, Domain>> = {
  openness: "O",
  intellect: "O",
  industriousness: "C",
  orderliness: "C",
  enthusiasm: "E",
  assertiveness: "E",
  compassion: "A",
  politeness: "A",
  withdrawal: "N",
  volatility: "N",
};

/** Correlation between the two aspects within any one Big-Five domain. */
export const WITHIN_DOMAIN_CORR = 0.22;

/** Cross-domain correlations, keyed by the alphabetically-sorted domain pair. Missing → 0. */
const CROSS_DOMAIN_CORR: Readonly<Record<string, number>> = {
  "C-O": -0.31, // Conscientiousness ↔ Openness — the N↔J anti-correlation (the big lever)
  "E-O": 0.07, // Extraversion ↔ Openness
  "A-O": -0.02, // Agreeableness ↔ Openness
  "C-E": -0.06, // Conscientiousness ↔ Extraversion
  "A-C": -0.1, // Agreeableness ↔ Conscientiousness
  "A-E": 0.04, // Agreeableness ↔ Extraversion
};

const N_ASPECTS = ASPECTS.length;

/** The aspect correlation matrix (row-major flat, N×N) in ASPECTS order. */
function buildCorrelationMatrix(): Float64Array {
  const n = N_ASPECTS;
  const R = new Float64Array(n * n);
  ASPECTS.forEach((ai, i) => {
    ASPECTS.forEach((aj, j) => {
      if (i === j) {
        R[i * n + j] = 1;
        return;
      }
      const di = DOMAIN[ai];
      const dj = DOMAIN[aj];
      R[i * n + j] =
        di === dj ? WITHIN_DOMAIN_CORR : (CROSS_DOMAIN_CORR[[di, dj].sort().join("-")] ?? 0);
    });
  });
  return R;
}

/** Lower-triangular Cholesky factor L (flat, N×N) with L·Lᵀ = R. Throws if R isn't pos-def. */
function cholesky(R: Float64Array, n: number): Float64Array {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      // `?? 0` only satisfies noUncheckedIndexedAccess; flat indices are always in bounds.
      let sum = R[i * n + j] ?? 0;
      for (let k = 0; k < j; k++) sum -= (L[i * n + k] ?? 0) * (L[j * n + k] ?? 0);
      if (i === j) {
        if (sum <= 0) throw new Error("seeding correlation matrix is not positive-definite");
        L[i * n + j] = Math.sqrt(sum);
      } else {
        L[i * n + j] = sum / (L[j * n + j] ?? 1);
      }
    }
  }
  return L;
}

/** Cholesky factor of the aspect correlation matrix — computed once at module load. */
const CHOL = cholesky(buildCorrelationMatrix(), N_ASPECTS);

const MASK64 = (1n << 64n) - 1n;
const TWO53 = 9007199254740992; // 2^53
const TWO_PI = 2 * Math.PI;

/** FNV-1a (64-bit) over the entropy bytes → a deterministic seed for splitmix64. */
function hashEntropy(entropy: Uint8Array): bigint {
  let h = 0xcbf29ce484222325n;
  // Fold the length in first so [] and [0] don't collide on the basis.
  h = (h ^ BigInt(entropy.length & 0xff)) & MASK64;
  h = (h * 0x100000001b3n) & MASK64;
  for (let i = 0; i < entropy.length; i++) {
    h = (h ^ BigInt(entropy[i] as number)) & MASK64;
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

/**
 * A deterministic RNG seeded from entropy bytes: splitmix64 stream → uniforms in [0,1)
 * → standard normals via Box-Muller (the spare normal is cached, 2 draws per pair).
 *
 * THE SEAM: `seedFromEntropy` builds one of these per birth. A test that supplies a fixed
 * entropy stream gets byte-identical souls every run. State is local to this closure, so
 * the cached spare never leaks between births.
 */
function makeRng(entropy: Uint8Array): { uniform: () => number; normal: () => number } {
  let state = hashEntropy(entropy) & MASK64;
  let spare: number | null = null;

  const next64 = (): bigint => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    z = z ^ (z >> 31n);
    return z & MASK64;
  };

  // Top 53 bits → a uniform double in [0,1).
  const uniform = (): number => Number(next64() >> 11n) / TWO53;

  const normal = (): number => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u1 = uniform();
    const u2 = uniform();
    if (u1 < 1e-12) u1 = 1e-12; // guard log(0)
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = TWO_PI * u2;
    spare = r * Math.sin(theta);
    return r * Math.cos(theta);
  };

  return { uniform, normal };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Seed a fresh Soul from birth entropy.
 *
 * Draw order is FIXED (so identical entropy → byte-identical soul):
 *   1. sex          — one uniform, `<0.5` → male
 *   2. 10 normals   — one standard normal per aspect (ASPECTS order), correlated through the
 *                     Cholesky factor, scaled by σ, shifted by the sex-signed mean, clamped to [0,1]
 *   3. stubbornness — one uniform in [0,1] (0 = clay, 1 = stubborn)
 *
 * At birth: v = s (set points), a = 0, tension = 0, disuseAnchor = v, mp = 0,
 * lastUsedAt = now. Sex affects ONLY these seeding means — never voice/behavior.
 */
export function seedFromEntropy(entropy: Uint8Array, now: number): Soul {
  const rng = makeRng(entropy);

  const sex: Sex = rng.uniform() < 0.5 ? "male" : "female";
  const sexFactor = sex === "female" ? 1 : -1;

  // Independent standard normals → correlated via Cholesky (corr = L·z).
  const n = N_ASPECTS;
  const z = new Float64Array(n);
  for (let i = 0; i < n; i++) z[i] = rng.normal();

  const s = {} as AspectVector;
  ASPECTS.forEach((aspect, i) => {
    let corr = 0;
    for (let k = 0; k <= i; k++) corr += (CHOL[i * n + k] ?? 0) * (z[k] ?? 0);
    const { sigma, d, femaleSign } = SEEDING[aspect];
    const mean = 0.5 + 0.5 * d * sigma * femaleSign * sexFactor;
    s[aspect] = clamp01(mean + sigma * corr);
  });

  const stubbornness = rng.uniform();

  // v, disuseAnchor copy the set points; a and tension start at zero.
  const v = {} as AspectVector;
  const a = {} as AspectVector;
  const tension = {} as AspectVector;
  const disuseAnchor = {} as AspectVector;
  for (const aspect of ASPECTS) {
    v[aspect] = s[aspect];
    disuseAnchor[aspect] = s[aspect];
    a[aspect] = 0;
    tension[aspect] = 0;
  }

  return { v, s, a, tension, disuseAnchor, stubbornness, sex, mp: 0, lastUsedAt: now };
}
