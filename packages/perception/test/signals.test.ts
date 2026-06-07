/**
 * @saulene/perception — ledgerToSignals parity test
 *
 * Verifies the extracted ledgerToSignals produces exactly the same output as
 * the inline signal conversion that used to live in packages/plugin/src/hooks/stop.ts.
 */

import { describe, expect, it } from "vitest";
import { type Observation, ledgerToSignals } from "../src/index.js";

function obs(
  aspect: Observation["aspect"],
  practice: number,
  fit: number,
  mode: Observation["mode"] = "task",
): Observation {
  return {
    aspect,
    mode,
    practice,
    fit,
    confidence: "high",
    evidence_quote: "quote",
    first_person_note: "I felt it.",
    salience: 1,
  };
}

describe("ledgerToSignals", () => {
  it("empty observations → empty signals", () => {
    const { practice, fit } = ledgerToSignals([]);
    expect(Object.keys(practice)).toHaveLength(0);
    expect(Object.keys(fit)).toHaveLength(0);
  });

  it("single observation normalizes practice to 0–1", () => {
    const { practice } = ledgerToSignals([obs("industriousness", 3, 0)]);
    expect(practice.industriousness).toBeCloseTo(1.0);
  });

  it("single observation normalizes fit to −1..+1", () => {
    const { fit } = ledgerToSignals([obs("orderliness", 0, -3)]);
    expect(fit.orderliness).toBeCloseTo(-1.0);
  });

  it("two observations on the same aspect → averaged", () => {
    const { practice, fit } = ledgerToSignals([
      obs("openness", 3, 3, "task"),
      obs("openness", 0, -3, "interaction"),
    ]);
    expect(practice.openness).toBeCloseTo(0.5);
    expect(fit.openness).toBeCloseTo(0.0);
  });

  it("different aspects are independent", () => {
    const { practice, fit } = ledgerToSignals([
      obs("intellect", 2, 1),
      obs("industriousness", 1, -2),
    ]);
    expect(practice.intellect).toBeCloseTo(2 / 3);
    expect(practice.industriousness).toBeCloseTo(1 / 3);
    expect(fit.intellect).toBeCloseTo(1 / 3);
    expect(fit.industriousness).toBeCloseTo(-2 / 3);
  });

  it("parity: matches the old inline loop for a mixed observation list", () => {
    // Reproduce the exact computation that was in stop.ts before extraction.
    const observations: Observation[] = [
      obs("openness", 2, 1, "task"),
      obs("openness", 1, -1, "interaction"),
      obs("industriousness", 3, 2),
    ];

    // Old inline calculation (verbatim from pre-extraction stop.ts):
    const ASPECTS = [
      "openness",
      "conscientiousness",
      "extraversion",
      "agreeableness",
      "neuroticism",
      "intellect",
      "industriousness",
      "orderliness",
      "enthusiasm",
      "assertiveness",
    ] as const;
    type Aspect = (typeof ASPECTS)[number];
    type PartialVec = Partial<Record<Aspect, number>>;
    const practiceSums: PartialVec = {};
    const fitSums: PartialVec = {};
    const counts: PartialVec = {};
    for (const ob of observations) {
      const a = ob.aspect as Aspect;
      practiceSums[a] = (practiceSums[a] ?? 0) + ob.practice / 3;
      fitSums[a] = (fitSums[a] ?? 0) + ob.fit / 3;
      counts[a] = (counts[a] ?? 0) + 1;
    }
    const expectedPractice: PartialVec = {};
    const expectedFit: PartialVec = {};
    for (const a of ASPECTS) {
      const n = counts[a];
      if (n) {
        expectedPractice[a] = (practiceSums[a] ?? 0) / n;
        expectedFit[a] = (fitSums[a] ?? 0) / n;
      }
    }

    const { practice, fit } = ledgerToSignals(observations);
    for (const a of ASPECTS) {
      // Only compare aspects where both expected and actual have a value.
      // Aspects not exercised are absent in both — comparing undefined vs 0 is not parity.
      if (expectedPractice[a] !== undefined || practice[a] !== undefined) {
        expect(practice[a] ?? 0).toBeCloseTo(expectedPractice[a] ?? 0, 10);
        expect(fit[a] ?? 0).toBeCloseTo(expectedFit[a] ?? 0, 10);
      }
    }
  });
});
