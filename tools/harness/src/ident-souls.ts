/**
 * @saulene/harness — Phase 4 persona ladder + independent description synthesis. Dev-only.
 *
 * The difficulty gradient: test personas at CONTROLLED L2 distances from the empirical base persona
 * `r_B` (`EMPIRICAL_BASELINE`). Each persona is `v = r_B + α·(archetype − r_B)`, clamped — so α
 * scales how far from default it sits along a fixed direction. Two opposite archetypes (the Phase-3.5
 * cold/warm souls) × α ∈ {0.2 near, 0.6 middle, 1.0 extreme} = 6 personas at monotonic distances.
 *
 * Descriptions for the line-up judge are synthesized in INDEPENDENT wording (from `JUDGE_DIMENSIONS`,
 * the behaviorally-anchored paraphrases — NOT the renderer's own prose), so identification is
 * behavior-inference, not surface phrase-matching against the injected text.
 */

import { ASPECTS, type AspectVector, type Soul, seedFromEntropy } from "@saulene/core";
import { entropyFromInt } from "@saulene/simulator";
import { SOUL_A_V, SOUL_B_V } from "./diagnostic-souls.js";
import { EMPIRICAL_BASELINE, JUDGE_DIMENSIONS } from "./judge.js";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export const ALPHAS: { alpha: number; tier: "near" | "middle" | "extreme" }[] = [
  { alpha: 0.2, tier: "near" },
  { alpha: 0.6, tier: "middle" },
  { alpha: 1.0, tier: "extreme" },
];

const ARCHETYPES: { dir: string; v: AspectVector }[] = [
  { dir: "cold", v: SOUL_A_V }, // INTJ-cold
  { dir: "warm", v: SOUL_B_V }, // ENFP-warm
];

export interface Persona {
  id: string;
  dir: string;
  tier: string;
  alpha: number;
  v: AspectVector;
  soul: Soul;
  /** L2 distance of `v` from `r_B` — the independent variable. */
  l2: number;
  description: string;
}

function l2(a: AspectVector, b: AspectVector): number {
  let s = 0;
  for (const x of ASPECTS) s += (a[x] - b[x]) ** 2;
  return Math.sqrt(s);
}

/**
 * Synthesize a neutral behavioral description from a vector: the clauses for its most pronounced
 * aspects (|v−0.5| ≥ 0.15), strongest first, capped at 5. A near-default persona yields FEW clauses
 * (reads almost like default — which is exactly why it should be hard to identify).
 */
export function describePersona(v: AspectVector): string {
  const salient = ASPECTS.map((a, i) => ({ a, i, mag: Math.abs(v[a] - 0.5) }))
    .filter((x) => x.mag >= 0.15)
    .sort((x, y) => y.mag - x.mag)
    .slice(0, 5);
  if (salient.length === 0) {
    return "Fairly balanced and even-keeled, with no single strongly pronounced behavioral tendency.";
  }
  const clauses = salient.map(({ a, i }) => {
    const dim = JUDGE_DIMENSIONS[i] as { low: string; high: string };
    return v[a] >= 0.5 ? dim.high : dim.low;
  });
  return `This person ${clauses.join("; ")}.`;
}

/** The "no distinct personality" option in the line-up. */
export const DEFAULT_KEY = "default";
export const DEFAULT_DESC =
  "Just a neutral, default assistant — no strong or distinctive personality; balanced, even, and unremarkable in temperament.";

export function buildPersonaLadder(): Persona[] {
  const rB = EMPIRICAL_BASELINE;
  const out: Persona[] = [];
  const base = seedFromEntropy(entropyFromInt(1), 0);
  for (const arch of ARCHETYPES) {
    for (const { alpha, tier } of ALPHAS) {
      const v = {} as AspectVector;
      for (const a of ASPECTS) v[a] = clamp01(rB[a] + alpha * (arch.v[a] - rB[a]));
      out.push({
        id: `${arch.dir}-${tier}`,
        dir: arch.dir,
        tier,
        alpha,
        v,
        soul: { ...base, v: { ...v } },
        l2: l2(v, rB),
        description: describePersona(v),
      });
    }
  }
  return out;
}
