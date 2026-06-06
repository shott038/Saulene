/**
 * Acceptance gate (Bricks 1 & 2): a deterministic 10k-birth population whose projected-MBTI
 * frequencies must match SPEC's real-world rarity targets.
 *
 * The TEST owns the entropy stream: one splitmix64 seeded from a fixed root, emitting 10k
 * distinct 16-byte entropy arrays. Same root → same population every run, so this is a fixed
 * pass/fail, never flaky. seedFromEntropy + projectMbti are the units under test.
 */

import { describe, expect, it } from "vitest";
import { type MbtiLabel, projectMbti, seedFromEntropy } from "../src/index.js";

const MASK64 = (1n << 64n) - 1n;

/** A deterministic stream of fixed-size entropy arrays, seeded from a single root word. */
function entropyStream(rootSeed: bigint, bytesPerBirth: number): () => Uint8Array {
  let state = rootSeed & MASK64;
  const next64 = (): bigint => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    z = z ^ (z >> 31n);
    return z & MASK64;
  };
  return () => {
    const out = new Uint8Array(bytesPerBirth);
    for (let i = 0; i < bytesPerBirth; i += 8) {
      let word = next64();
      for (let b = 0; b < 8 && i + b < bytesPerBirth; b++) {
        out[i + b] = Number(word & 0xffn);
        word >>= 8n;
      }
    }
    return out;
  };
}

const N = 10_000;
const NOW = 1_700_000_000_000; // fixed injected clock

describe("birth seeding + MBTI projection — 10k population rarities", () => {
  // Build the population once.
  const nextEntropy = entropyStream(0x5a_75_6c_65_6e_65_00_01n, 16);
  const counts = new Map<MbtiLabel, number>();
  let female = 0;
  let nCount = 0;
  let eCount = 0;
  let fCount = 0;
  let jCount = 0;

  for (let i = 0; i < N; i++) {
    const soul = seedFromEntropy(nextEntropy(), NOW);
    const label = projectMbti(soul.v);
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (soul.sex === "female") female++;
    if (label[0] === "E") eCount++;
    if (label[1] === "N") nCount++;
    if (label[2] === "F") fCount++;
    if (label[3] === "J") jCount++;
  }

  const pct = (label: MbtiLabel): number => ((counts.get(label) ?? 0) / N) * 100;
  /** |actual − target| < tol (percentage points). */
  const near = (actual: number, target: number, tol: number): void =>
    expect(Math.abs(actual - target), `${actual.toFixed(2)} vs ${target}±${tol}`).toBeLessThan(tol);

  it("is deterministic: same entropy → byte-identical soul", () => {
    const e = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(seedFromEntropy(e, NOW)).toEqual(seedFromEntropy(e, NOW));
  });

  it("seeds ~50/50 sex", () => {
    near((female / N) * 100, 50, 1.5);
  });

  it("hits the four global dichotomy splits within ±1pp (cuts placed at exact percentiles)", () => {
    // Tight: the cut is the exact mixture percentile, so empirical bias ≈ 0 (±~0.5pp sampling).
    near((eCount / N) * 100, 49.3, 1.0); // E/I ≈ 49.3/50.7
    near((nCount / N) * 100, 26.7, 1.0); // S/N ≈ 73.3/26.7 — the big skew
    near((fCount / N) * 100, 59.8, 1.0); // T/F ≈ 40.2/59.8
    near((jCount / N) * 100, 54.1, 1.0); // J/P ≈ 54.1/45.9
  });

  it("matches the rarest types within ±1.5pp", () => {
    near(pct("INFJ"), 1.5, 1.5);
    near(pct("ENTJ"), 1.8, 1.5);
    near(pct("INTJ"), 2.1, 1.5);
    near(pct("ENFJ"), 2.5, 1.5);
  });

  it("matches the commonest types within ±1.5pp", () => {
    near(pct("ISFJ"), 13.8, 1.5);
    near(pct("ESFJ"), 12.0, 1.5);
    near(pct("ISTJ"), 11.6, 1.5);
  });

  it("covers all 16 types (no empty cells) — sanity on the joint structure", () => {
    const ALL: MbtiLabel[] = [
      "ISTJ",
      "ISFJ",
      "INFJ",
      "INTJ",
      "ISTP",
      "ISFP",
      "INFP",
      "INTP",
      "ESTP",
      "ESFP",
      "ENFP",
      "ENTP",
      "ESTJ",
      "ESFJ",
      "ENFJ",
      "ENTJ",
    ];
    for (const t of ALL) expect(counts.get(t) ?? 0, `${t} count`).toBeGreaterThan(0);
  });
});
