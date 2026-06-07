import { DEFAULT_KNOBS, seedFromEntropy } from "@saulene/core";
import { describe, expect, it } from "vitest";
import { EmpiricalLedgerSource } from "../src/empirical-source.js";
import type { CorpusRecord } from "../src/types.js";

const minRecord = (
  persona: string,
  workType: string,
  stage: string,
  stateBucket: string,
  practice: number,
  fit: number,
): CorpusRecord => ({
  bucket: { persona, workType, stage, stateBucket },
  ledger: {
    observations: [
      {
        aspect: "intellect",
        mode: "task",
        practice,
        fit,
        confidence: "high",
        evidence_quote: "test quote",
        first_person_note: "I did a thing",
        salience: 1,
      },
    ],
    session_significance: 0.5,
  },
  meta: { soulHash: "abc", model: "test" },
});

const SOUL = seedFromEntropy(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 0);

describe("EmpiricalLedgerSource", () => {
  it("rejects an empty corpus", () => {
    expect(() => new EmpiricalLedgerSource([], 0)).toThrow("corpus is empty");
  });

  it("returns a ScriptedSession with correct significance", () => {
    const corpus = [minRecord("dev", "coding", "adulthood", "INTP", 3, 2)];
    const src = new EmpiricalLedgerSource(corpus, 42);
    const sess = src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: 0 });
    expect(sess.significance).toBeCloseTo(0.5);
    // practice ordinal 3 → 1.0; fit ordinal 2 → 2/3 ≈ 0.667
    expect(sess.practice.intellect).toBeCloseTo(1.0);
    expect(sess.fit.intellect).toBeCloseTo(2 / 3);
  });

  it("is deterministic: same inputs → same session", () => {
    const corpus = [
      minRecord("dev", "coding", "adulthood", "INTP", 2, 1),
      minRecord("dev", "coding", "adulthood", "INTP", 3, -1),
    ];
    const src = new EmpiricalLedgerSource(corpus, 99);
    const s1 = src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: 7 });
    const s2 = src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: 7 });
    expect(s1.practice).toEqual(s2.practice);
    expect(s1.fit).toEqual(s2.fit);
    expect(s1.significance).toEqual(s2.significance);
  });

  it("different session indices may draw different records", () => {
    const corpus = [
      minRecord("dev", "coding", "adulthood", "INTP", 1, 0),
      minRecord("dev", "coding", "adulthood", "INTP", 3, 2),
      minRecord("dev", "coding", "adulthood", "INTP", 2, -1),
    ];
    const src = new EmpiricalLedgerSource(corpus, 1);
    const sessions = Array.from({ length: 20 }, (_, i) =>
      src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: i }),
    );
    // With 3 records and 20 draws, we should see at least 2 distinct practice[intellect] values.
    const uniquePractice = new Set(sessions.map((s) => s.practice.intellect));
    expect(uniquePractice.size).toBeGreaterThan(1);
  });

  it("falls back gracefully when no exact bucket match", () => {
    const corpus = [minRecord("dev", "coding", "adulthood", "INTP", 2, 1)];
    const src = new EmpiricalLedgerSource(corpus, 0);
    // Ask for a persona/workType match that exists but wrong stateBucket
    const sess = src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: 0 });
    expect(sess.significance).toBeCloseTo(0.5);
  });

  it("falls back to all records when no persona/workType match", () => {
    const corpus = [minRecord("writer", "creative", "adulthood", "INFP", 3, 3)];
    const src = new EmpiricalLedgerSource(corpus, 0);
    // Ask for a different persona entirely → falls back to all records
    const sess = src.next(SOUL, { persona: "unknown", workType: "unknown", sessionIndex: 0 });
    expect(sess.significance).toBeCloseTo(0.5);
  });

  it("averages across multiple observations on the same aspect", () => {
    const record: CorpusRecord = {
      bucket: { persona: "dev", workType: "coding", stage: "adulthood", stateBucket: "INTP" },
      ledger: {
        observations: [
          {
            aspect: "intellect",
            mode: "task",
            practice: 3,
            fit: 3,
            confidence: "high",
            evidence_quote: "q1",
            first_person_note: "n1",
            salience: 1,
          },
          {
            aspect: "intellect",
            mode: "interaction",
            practice: 1,
            fit: -1,
            confidence: "low",
            evidence_quote: "q2",
            first_person_note: "n2",
            salience: 1,
          },
        ],
        session_significance: 0.4,
      },
      meta: { soulHash: "x", model: "test" },
    };
    const src = new EmpiricalLedgerSource([record], 0);
    const sess = src.next(SOUL, { persona: "dev", workType: "coding", sessionIndex: 0 });
    // Average: practice = (3/3 + 1/3) / 2 = (1 + 0.333) / 2 = 0.667
    expect(sess.practice.intellect).toBeCloseTo((1 + 1 / 3) / 2, 4);
    // Average: fit = (3/3 + -1/3) / 2 = (1 - 0.333) / 2 = 0.333
    expect(sess.fit.intellect).toBeCloseTo((1 - 1 / 3) / 2, 4);
  });
});
