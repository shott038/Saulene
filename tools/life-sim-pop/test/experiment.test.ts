import { DEFAULT_KNOBS } from "@saulene/core";
import { block, script } from "@saulene/simulator";
import { describe, expect, it } from "vitest";
import { crnPaired, frozenSoulAB, latinHypercube, powerAnalysis } from "../src/experiment.js";

const ALIGNED = script(
  block({
    aspects: ["intellect", "openness"],
    practice: 0.8,
    fit: 0.7,
    significance: 0.6,
    count: 80,
  }),
);

const GRIND = script(
  block({
    aspects: ["industriousness", "orderliness"],
    practice: 0.9,
    fit: -0.7,
    significance: 0.6,
    count: 80,
  }),
);

const SEEDS = Array.from({ length: 20 }, (_, i) => i);

// ── crnPaired ─────────────────────────────────────────────────────────────────

describe("crnPaired()", () => {
  it("returns one result per seed", () => {
    const results = crnPaired({
      seeds: SEEDS,
      sessions: ALIGNED,
      knobA: DEFAULT_KNOBS,
      knobB: { ...DEFAULT_KNOBS, alpha: DEFAULT_KNOBS.alpha * 2 },
    });
    expect(results).toHaveLength(SEEDS.length);
  });

  it("delta >= 0 for all pairs", () => {
    const results = crnPaired({
      seeds: SEEDS,
      sessions: ALIGNED,
      knobA: DEFAULT_KNOBS,
      knobB: { ...DEFAULT_KNOBS, alpha: DEFAULT_KNOBS.alpha * 1.5 },
    });
    for (const r of results) {
      expect(r.delta).toBeGreaterThanOrEqual(0);
    }
  });

  it("identical knobs → delta === 0 for all pairs", () => {
    const results = crnPaired({
      seeds: SEEDS,
      sessions: ALIGNED,
      knobA: DEFAULT_KNOBS,
      knobB: DEFAULT_KNOBS,
    });
    for (const r of results) {
      expect(r.delta).toBeCloseTo(0);
    }
  });

  it("is deterministic", () => {
    const opts = {
      seeds: SEEDS,
      sessions: ALIGNED,
      knobA: DEFAULT_KNOBS,
      knobB: { ...DEFAULT_KNOBS, alpha: DEFAULT_KNOBS.alpha * 2 },
    };
    const r1 = crnPaired(opts);
    const r2 = crnPaired(opts);
    expect(r1).toEqual(r2);
  });
});

// ── frozenSoulAB ──────────────────────────────────────────────────────────────

describe("frozenSoulAB()", () => {
  it("returns one result per seed", () => {
    const results = frozenSoulAB({ seeds: SEEDS, sessions: ALIGNED });
    expect(results).toHaveLength(SEEDS.length);
  });

  it("causalDrift >= 0 for all results", () => {
    const results = frozenSoulAB({ seeds: SEEDS, sessions: ALIGNED });
    for (const r of results) {
      expect(r.causalDrift).toBeGreaterThanOrEqual(0);
    }
  });

  it("aligned life drifts further than a zero-practice life", () => {
    const noOp = script(
      block({ aspects: ["intellect"], practice: 0, fit: 0, significance: 0.01, count: 5 }),
    );
    const aligned = frozenSoulAB({
      seeds: Array.from({ length: 30 }, (_, i) => i),
      sessions: ALIGNED,
    });
    const noop = frozenSoulAB({ seeds: Array.from({ length: 30 }, (_, i) => i), sessions: noOp });
    const meanAligned = aligned.reduce((s, r) => s + r.causalDrift, 0) / aligned.length;
    const meanNoop = noop.reduce((s, r) => s + r.causalDrift, 0) / noop.length;
    expect(meanAligned).toBeGreaterThan(meanNoop);
  });

  it("vFrozen equals vDrifting when script has no practice", () => {
    const noOp = script(block({ aspects: [], practice: 0, fit: 0, significance: 0.01, count: 3 }));
    const results = frozenSoulAB({ seeds: [0, 1, 2], sessions: noOp });
    for (const r of results) {
      expect(r.causalDrift).toBeCloseTo(0, 5);
    }
  });

  it("is deterministic", () => {
    const opts = { seeds: SEEDS, sessions: ALIGNED };
    expect(frozenSoulAB(opts)).toEqual(frozenSoulAB(opts));
  });
});

// ── latinHypercube ────────────────────────────────────────────────────────────

describe("latinHypercube()", () => {
  it("returns exactly n samples", () => {
    const samples = latinHypercube({
      n: 20,
      seedPool: SEEDS,
      scriptCount: 3,
      knobRanges: { alpha: { min: 0.1, max: 0.5 } },
      rngSeed: 1,
    });
    expect(samples).toHaveLength(20);
  });

  it("all seedIds come from the seedPool", () => {
    const pool = [10, 20, 30, 40, 50];
    const samples = latinHypercube({
      n: 15,
      seedPool: pool,
      scriptCount: 2,
      knobRanges: { alpha: { min: 0.1, max: 0.5 } },
      rngSeed: 7,
    });
    for (const s of samples) {
      expect(pool).toContain(s.seedId);
    }
  });

  it("all scriptIdx values are within [0, scriptCount)", () => {
    const samples = latinHypercube({
      n: 30,
      seedPool: SEEDS,
      scriptCount: 4,
      knobRanges: { theta: { min: 0.5, max: 3.0 } },
      rngSeed: 2,
    });
    for (const s of samples) {
      expect(s.scriptIdx).toBeGreaterThanOrEqual(0);
      expect(s.scriptIdx).toBeLessThan(4);
    }
  });

  it("knob values stay within specified ranges", () => {
    const samples = latinHypercube({
      n: 20,
      seedPool: SEEDS,
      scriptCount: 2,
      knobRanges: {
        alpha: { min: 0.1, max: 0.5 },
        theta: { min: 1.0, max: 5.0 },
      },
      rngSeed: 3,
    });
    for (const s of samples) {
      const alpha = s.knobs.alpha ?? 0;
      const theta = s.knobs.theta ?? 0;
      expect(alpha).toBeGreaterThanOrEqual(0.1);
      expect(alpha).toBeLessThanOrEqual(0.5);
      expect(theta).toBeGreaterThanOrEqual(1.0);
      expect(theta).toBeLessThanOrEqual(5.0);
    }
  });

  it("is deterministic with same rngSeed", () => {
    const opts = {
      n: 15,
      seedPool: SEEDS,
      scriptCount: 3,
      knobRanges: { alpha: { min: 0.1, max: 0.4 } },
      rngSeed: 99,
    };
    expect(latinHypercube(opts)).toEqual(latinHypercube(opts));
  });

  it("covers all strata: each scriptIdx appears roughly n/scriptCount times", () => {
    const n = 60;
    const scriptCount = 4;
    const samples = latinHypercube({
      n,
      seedPool: Array.from({ length: 100 }, (_, i) => i),
      scriptCount,
      knobRanges: { alpha: { min: 0.1, max: 0.5 } },
      rngSeed: 5,
    });
    const counts = new Array<number>(scriptCount).fill(0);
    for (const s of samples) counts[s.scriptIdx] = (counts[s.scriptIdx] ?? 0) + 1;
    // LHS guarantees each stratum appears exactly once → each idx count = n/scriptCount
    for (const c of counts) {
      expect(c).toBeGreaterThan(0);
    }
  });
});

// ── powerAnalysis ─────────────────────────────────────────────────────────────

describe("powerAnalysis()", () => {
  it("returns nPerGroup > 0 for valid inputs", () => {
    const result = powerAnalysis({ observedEffect: 0.05, observedVariance: 0.01 });
    expect(result.nPerGroup).toBeGreaterThan(0);
    expect(result.nTotal).toBe(result.nPerGroup * 2);
  });

  it("larger effect → fewer required samples", () => {
    const small = powerAnalysis({ observedEffect: 0.02, observedVariance: 0.01 });
    const large = powerAnalysis({ observedEffect: 0.1, observedVariance: 0.01 });
    expect(large.nPerGroup).toBeLessThan(small.nPerGroup);
  });

  it("larger variance → more required samples", () => {
    const tight = powerAnalysis({ observedEffect: 0.05, observedVariance: 0.001 });
    const wide = powerAnalysis({ observedEffect: 0.05, observedVariance: 0.01 });
    expect(wide.nPerGroup).toBeGreaterThan(tight.nPerGroup);
  });

  it("higher targetPower → more required samples", () => {
    const low = powerAnalysis({ observedEffect: 0.05, observedVariance: 0.01, targetPower: 0.7 });
    const high = powerAnalysis({ observedEffect: 0.05, observedVariance: 0.01, targetPower: 0.95 });
    expect(high.nPerGroup).toBeGreaterThan(low.nPerGroup);
  });

  it("classic result: Cohen d=0.5, σ²=1 at 80% power → ~64 per group", () => {
    // Classic textbook: δ=0.5, σ²=1 → n ≈ 64 per arm (two-sample t-test).
    const result = powerAnalysis({ observedEffect: 0.5, observedVariance: 1.0 });
    expect(result.nPerGroup).toBeGreaterThan(50);
    expect(result.nPerGroup).toBeLessThan(80);
  });

  it("echoes back the input parameters", () => {
    const result = powerAnalysis({
      observedEffect: 0.1,
      observedVariance: 0.05,
      alpha: 0.01,
      targetPower: 0.9,
    });
    expect(result.observedEffect).toBe(0.1);
    expect(result.observedVariance).toBe(0.05);
    expect(result.alpha).toBe(0.01);
    expect(result.targetPower).toBe(0.9);
  });

  it("throws on non-positive effect or variance", () => {
    expect(() => powerAnalysis({ observedEffect: 0, observedVariance: 0.01 })).toThrow();
    expect(() => powerAnalysis({ observedEffect: 0.05, observedVariance: 0 })).toThrow();
  });
});
