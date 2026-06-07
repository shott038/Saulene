import { DEFAULT_KNOBS } from "@saulene/core";
import { block, script } from "@saulene/simulator";
import { describe, expect, it } from "vitest";
import { EmpiricalLedgerSource } from "../src/empirical-source.js";
import { population } from "../src/population.js";
import type { CorpusRecord } from "../src/types.js";

const ALIGNED = script(
  block({
    aspects: ["intellect", "openness"],
    practice: 0.8,
    fit: 0.7,
    significance: 0.6,
    count: 60,
  }),
  block({ aspects: ["industriousness"], practice: 0.4, fit: 0.3, significance: 0.5, count: 40 }),
);

const GRIND = script(
  block({
    aspects: ["industriousness", "orderliness"],
    practice: 0.9,
    fit: -0.7,
    significance: 0.6,
    count: 80,
  }),
  block({ aspects: ["intellect"], practice: 0.3, fit: 0.2, significance: 0.4, count: 40 }),
);

const SEEDS = Array.from({ length: 30 }, (_, i) => i);

describe("population()", () => {
  it("returns one LifeResult per (seed × script × knobSet)", () => {
    const result = population({
      seeds: SEEDS,
      userScripts: [
        { name: "aligned", sessions: ALIGNED },
        { name: "grind", sessions: GRIND },
      ],
      knobSets: [DEFAULT_KNOBS],
    });
    expect(result.lives).toHaveLength(SEEDS.length * 2 * 1);
  });

  it("is deterministic: same inputs → identical LifeResults", () => {
    const opts = {
      seeds: SEEDS.slice(0, 10),
      userScripts: [{ name: "aligned", sessions: ALIGNED }],
      knobSets: [DEFAULT_KNOBS],
    };
    const r1 = population(opts);
    const r2 = population(opts);
    expect(r1.lives).toEqual(r2.lives);
  });

  it("records finalMbti, breakCount, drift for every life", () => {
    const result = population({
      seeds: [0, 1, 2],
      userScripts: [{ name: "aligned", sessions: ALIGNED }],
      knobSets: [DEFAULT_KNOBS],
    });
    for (const life of result.lives) {
      expect(typeof life.finalMbti).toBe("string");
      expect(life.finalMbti.length).toBeGreaterThanOrEqual(4);
      expect(life.breakCount).toBeGreaterThanOrEqual(0);
      expect(life.drift).toBeGreaterThanOrEqual(0);
    }
  });

  it("metrics.n equals lives.length", () => {
    const result = population({
      seeds: SEEDS,
      userScripts: [{ name: "aligned", sessions: ALIGNED }],
      knobSets: [DEFAULT_KNOBS],
    });
    expect(result.metrics.n).toBe(result.lives.length);
  });

  it("adultMbtiDist counts sum to n", () => {
    const result = population({
      seeds: SEEDS,
      userScripts: [{ name: "aligned", sessions: ALIGNED }],
      knobSets: [DEFAULT_KNOBS],
    });
    const total = Object.values(result.metrics.adultMbtiDist).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.metrics.n);
  });

  it("aligned script drifts more than no-practice baseline", () => {
    const noOp = script(
      block({ aspects: ["intellect"], practice: 0, fit: 0, significance: 0.1, count: 10 }),
    );
    const result = population({
      seeds: Array.from({ length: 20 }, (_, i) => i),
      userScripts: [
        { name: "aligned", sessions: ALIGNED },
        { name: "noop", sessions: noOp },
      ],
      knobSets: [DEFAULT_KNOBS],
    });
    const m = result.metrics;
    expect(m.meanDriftByScript.aligned ?? 0).toBeGreaterThan(m.meanDriftByScript.noop ?? 0);
  });

  it("uses empirical script when ledgerSource is provided", () => {
    const record: CorpusRecord = {
      bucket: { persona: "dev", workType: "coding", stage: "adulthood", stateBucket: "INTP" },
      ledger: {
        observations: [
          {
            aspect: "intellect",
            mode: "task",
            practice: 2,
            fit: 1,
            confidence: "med",
            evidence_quote: "worked on the problem",
            first_person_note: "I solved it",
            salience: 1,
          },
        ],
        session_significance: 0.5,
      },
      meta: { soulHash: "abc", model: "test" },
    };
    const source = new EmpiricalLedgerSource([record], 0);
    const result = population({
      seeds: [0, 1, 2],
      userScripts: [
        { name: "empirical-dev", persona: "dev", workType: "coding", sessionCount: 30 },
      ],
      knobSets: [DEFAULT_KNOBS],
      ledgerSource: source,
    });
    expect(result.lives).toHaveLength(3);
    for (const life of result.lives) {
      expect(life.drift).toBeGreaterThanOrEqual(0);
    }
  });

  it("throws when empirical script used without ledgerSource", () => {
    expect(() =>
      population({
        seeds: [0],
        userScripts: [{ name: "empirical", persona: "dev", workType: "coding", sessionCount: 10 }],
        knobSets: [DEFAULT_KNOBS],
      }),
    ).toThrow("ledgerSource required");
  });

  it("breakRarity is between 0 and 1", () => {
    const result = population({
      seeds: Array.from({ length: 50 }, (_, i) => i),
      userScripts: [{ name: "grind", sessions: GRIND }],
      knobSets: [DEFAULT_KNOBS],
    });
    expect(result.metrics.breakRarity).toBeGreaterThanOrEqual(0);
    expect(result.metrics.breakRarity).toBeLessThanOrEqual(1);
  });
});
