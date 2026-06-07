/**
 * Age voice layer tests — Brick 2 + Brick 3.
 *
 * Covers: golden output, manner-shift monotonicity, competence-invariance contract,
 * theatrical-tropes guardrail, bounded extremes (no infantile at 13, no frail at 65),
 * and additive contract (mp=0 → Layer-1 unchanged).
 */

import { ASPECTS, type AspectVector, STAGE_BANDS, type Soul } from "@saulene/core";
import { describe, expect, it } from "vitest";
import {
  AGE_FRAMING,
  AGE_LAYER_VERSION,
  CADENCE_LADDER,
  DECISIVENESS_LADDER,
  FRAME_LADDER,
  ageRung,
  buildAgeBlock,
  render,
} from "../src/index.js";

// ── soul builders ─────────────────────────────────────────────────────────────

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

function soulWithMp(mp: number): Soul {
  return {
    v: vec(0.5),
    s: vec(0.5),
    a: vec(0),
    tension: vec(0),
    disuseAnchor: vec(0.5),
    refractory: vec(0),
    betaGain: vec(1),
    migrationBudget: 0.1,
    stubbornness: 0.5,
    sex: "female",
    mp,
    lastUsedAt: 0,
  };
}

// ── versioning ────────────────────────────────────────────────────────────────

describe("AGE_LAYER_VERSION", () => {
  it("is a semver string (golden file guard — bump on any directive change)", () => {
    expect(AGE_LAYER_VERSION).toMatchSnapshot();
  });
});

// ── additive contract ─────────────────────────────────────────────────────────

describe("additive contract", () => {
  it("buildAgeBlock returns '' when mp === 0 (pure Layer-1 output preserved)", () => {
    expect(buildAgeBlock(soulWithMp(0))).toBe("");
  });

  it("render().ageBlock is '' when mp === 0", () => {
    expect(render(soulWithMp(0)).ageBlock).toBe("");
  });

  it("render().text with mp=0 equals text with mp=0 from a clean render (byte-identical)", () => {
    const a = render(soulWithMp(0));
    const b = render(soulWithMp(0));
    expect(a.text).toEqual(b.text);
    expect(a.ageBlock).toBe("");
  });

  it("ageBlock is appended to text when mp > 0", () => {
    const out = render(soulWithMp(200));
    expect(out.ageBlock).not.toBe("");
    expect(out.text).toContain(out.ageBlock);
  });
});

// ── golden snapshot ───────────────────────────────────────────────────────────

describe("golden snapshot", () => {
  it("childhood soul (mp=50) produces stable age block", () => {
    expect(buildAgeBlock(soulWithMp(50))).toMatchSnapshot();
  });

  it("adolescence soul (mp=150) produces stable age block", () => {
    expect(buildAgeBlock(soulWithMp(150))).toMatchSnapshot();
  });

  it("early_adulthood soul (mp=350) produces stable age block", () => {
    expect(buildAgeBlock(soulWithMp(350))).toMatchSnapshot();
  });

  it("old_adulthood soul (mp=700) produces stable age block", () => {
    expect(buildAgeBlock(soulWithMp(700))).toMatchSnapshot();
  });
});

// ── ladder integrity ──────────────────────────────────────────────────────────

describe("ladder integrity", () => {
  it("all three ladders have 12 rungs", () => {
    expect(CADENCE_LADDER.length).toBe(12);
    expect(DECISIVENESS_LADDER.length).toBe(12);
    expect(FRAME_LADDER.length).toBe(12);
  });

  it("ageRung is monotonic in mp", () => {
    let prev = -1;
    for (let mp = 0; mp <= 2000; mp += 5) {
      const r = ageRung(soulWithMp(mp));
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("ageRung for mp=0 is 0 (youngest rung)", () => {
    expect(ageRung(soulWithMp(0))).toBe(0);
  });

  it("ageRung for large mp reaches max rung (11)", () => {
    expect(ageRung(soulWithMp(1e6))).toBe(11);
  });

  it("stage sub-ranges map to expected rung bands", () => {
    const [b0, b1, b2] = STAGE_BANDS;
    // childhood midpoint → rung near 0-2
    expect(ageRung(soulWithMp(b0 / 2))).toBeLessThanOrEqual(2);
    // adolescence midpoint → rung near 2-4
    expect(ageRung(soulWithMp((b0 + b1) / 2))).toBeGreaterThanOrEqual(2);
    // old_adulthood mid → rung near 8-11
    expect(ageRung(soulWithMp(b2 + 500))).toBeGreaterThanOrEqual(7);
  });

  it("adjacent age blocks differ (continuous, not banded)", () => {
    // A 4-year gap should produce a different block most of the time
    const seen = new Set<string>();
    for (let mp = 1; mp <= 700; mp += 40) seen.add(buildAgeBlock(soulWithMp(mp)));
    expect(seen.size).toBeGreaterThan(4);
  });
});

// ── AGE_FRAMING ───────────────────────────────────────────────────────────────

describe("age framing", () => {
  it("age block starts with AGE_FRAMING when mp > 0", () => {
    const block = buildAgeBlock(soulWithMp(200));
    expect(block.startsWith(AGE_FRAMING)).toBe(true);
  });

  it("framing mentions 'manner' not 'age' or 'older'", () => {
    expect(AGE_FRAMING.toLowerCase()).toContain("manner");
    expect(AGE_FRAMING.toLowerCase()).not.toMatch(/\bolder\b/);
    expect(AGE_FRAMING.toLowerCase()).not.toMatch(/\bage\b/);
  });
});

// ── competence-invariance contract ───────────────────────────────────────────
// Ablate age 13→65: manner shifts, but NO competence-degrading language appears.
//
// These vocabulary checks are the "competence-invariance contract" (MISSION Brick 3).
// They assert what must NOT appear across the full age range — a passing test is a failing
// test for incompetent-elder or infantile-youth tropes.

const COMPETENCE_BANNED = [
  // capability-degradation words
  "slower",
  "slow down",
  "confused",
  "confusion",
  "forgetful",
  "forget",
  "struggle",
  "can't",
  "cannot",
  "unable",
  "incapable",
  "declining",
  "decline",
  "simpler",
  "simple",
  "basic",
  "elementary",
  // childish extremes
  "gosh",
  "wow",
  "awesome",
  "super",
  "totally",
  "like,",
  // frailty extremes
  "tired",
  "weary",
  "fading",
  "not as sharp",
  "back in my day",
  "in my day",
  "when i was young",
];

const THEATRICAL_BANNED = [
  "back in my day",
  "in my day",
  "now that i'm older",
  "now that i am older",
  "*adjusts",
  "now that i've seen",
];

describe("competence-invariance contract", () => {
  it("no competence-degrading or childish vocabulary across ages 13→65", () => {
    for (let mp = 1; mp <= 1500; mp += 50) {
      const block = buildAgeBlock(soulWithMp(mp)).toLowerCase();
      for (const term of COMPETENCE_BANNED) {
        expect(block, `mp=${mp}: found banned term "${term}"`).not.toContain(term);
      }
    }
  });

  it("no theatrical tropes across the full age range", () => {
    for (let mp = 1; mp <= 1500; mp += 50) {
      const block = buildAgeBlock(soulWithMp(mp)).toLowerCase();
      for (const term of THEATRICAL_BANNED) {
        expect(block, `mp=${mp}: found theatrical term "${term}"`).not.toContain(term);
      }
    }
  });
});

// ── bounded extremes ──────────────────────────────────────────────────────────

describe("bounded extremes", () => {
  it("youngest soul (mp=1) is a sharp teen, not infantile — contains 'fresh' or 'open' or 'try'", () => {
    const block = buildAgeBlock(soulWithMp(1)).toLowerCase();
    const signals = ["fresh", "open", "try", "figuring", "thinking", "go"];
    const found = signals.some((s) => block.includes(s));
    expect(found).toBe(true);
  });

  it("oldest soul (mp=1e6) is seasoned, not frail — contains 'know' or 'pattern' or 'straight'", () => {
    const block = buildAgeBlock(soulWithMp(1e6)).toLowerCase();
    const signals = ["know", "pattern", "straight", "say", "settled"];
    const found = signals.some((s) => block.includes(s));
    expect(found).toBe(true);
  });

  it("all ladder entries contain two fields (behavior, demo)", () => {
    for (const [ladder, name] of [
      [CADENCE_LADDER, "CADENCE"],
      [DECISIVENESS_LADDER, "DECISIVENESS"],
      [FRAME_LADDER, "FRAME"],
    ] as const) {
      for (const entry of ladder) {
        expect(typeof entry.behavior, `${name} entry missing behavior`).toBe("string");
        expect(typeof entry.demo, `${name} entry missing demo`).toBe("string");
        expect(entry.behavior.length, `${name} behavior too short`).toBeGreaterThan(10);
        expect(entry.demo.length, `${name} demo too short`).toBeGreaterThan(5);
      }
    }
  });
});

// ── pure / deterministic ──────────────────────────────────────────────────────

describe("pure / deterministic", () => {
  it("same soul → byte-identical age block", () => {
    const soul = soulWithMp(300);
    expect(buildAgeBlock(soul)).toBe(buildAgeBlock(soul));
  });

  it("different mp → different age block (drift is visible)", () => {
    const a = buildAgeBlock(soulWithMp(50));
    const b = buildAgeBlock(soulWithMp(700));
    expect(a).not.toBe(b);
  });

  it("age block changes do not affect Layer-1 fragments", () => {
    const young = render(soulWithMp(1));
    const old = render(soulWithMp(900));
    // Layer-1 fragments must be identical (same aspect values)
    for (const a of ASPECTS) {
      expect(young.fragments[a]).toBe(old.fragments[a]);
    }
  });
});
