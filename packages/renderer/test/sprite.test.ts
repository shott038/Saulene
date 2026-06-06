import { ASPECTS, type Aspect, type AspectVector, type Soul } from "@saulene/core";
import { describe, expect, it } from "vitest";
import {
  SPRITE_EXCLUSIVE,
  SPRITE_STAGE_SCALES,
  SPRITE_VERSION,
  type SpriteParams,
  spriteHash,
  spriteParams,
} from "../src/index.js";

// ── soul builders ─────────────────────────────────────────────────────────────
// Mirror the renderer.test.ts builder pattern: v is all that typically varies;
// s / stubbornness / sex / mp are filled with stable defaults.

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

function soulOf(base: number, overrides: Partial<AspectVector> = {}, opts: {
  stubbornness?: number;
  mp?: number;
  sex?: "male" | "female";
  s?: Partial<AspectVector>;
} = {}): Soul {
  const v = vec(base);
  for (const [a, val] of Object.entries(overrides)) v[a as Aspect] = val as number;
  const s = vec(0.5);
  if (opts.s) for (const [a, val] of Object.entries(opts.s)) s[a as Aspect] = val as number;
  return {
    v,
    s,
    a: vec(0),
    tension: vec(0),
    disuseAnchor: vec(0.5),
    refractory: vec(0),
    betaGain: vec(1),
    migrationBudget: 0.1,
    stubbornness: opts.stubbornness ?? 0.5,
    sex: opts.sex ?? "female",
    mp: opts.mp ?? 0,
    lastUsedAt: 0,
  };
}

// ── golden file + determinism ─────────────────────────────────────────────────

describe("spriteParams — determinism / golden file", () => {
  it("is byte-identical across calls (pure)", () => {
    const soul = soulOf(0.5, { openness: 0.7, volatility: 0.3, assertiveness: 0.9 });
    expect(spriteParams(soul)).toEqual(spriteParams(soul));
  });

  it("matches the golden snapshot for a fixed soul", () => {
    const soul = soulOf(0.5, {
      openness: 0.82,
      intellect: 0.71,
      industriousness: 0.78,
      orderliness: 0.25,
      enthusiasm: 0.6,
      assertiveness: 0.7,
      compassion: 0.68,
      politeness: 0.3,
      withdrawal: 0.4,
      volatility: 0.55,
    }, { stubbornness: 0.35, mp: 0 });
    expect(spriteParams(soul)).toMatchSnapshot();
  });

  it("SPRITE_VERSION matches snapshot", () => {
    expect(SPRITE_VERSION).toMatchSnapshot();
  });

  it("all expected fields are present in the output", () => {
    const params = spriteParams(soulOf(0.5));
    const expected: (keyof SpriteParams)[] = [
      "hue", "saturation", "lightness",
      "bodyScaleX", "bodyScaleY",
      "puffJitter", "topBulge", "bottomBulge",
      "eyeRadius", "eyeSpacingFactor", "eyeDropY", "blush", "mouthCurve",
      "wispCount", "wispLengthFactor", "aura",
      "shimmer", "tilt",
      "stage", "stageScale",
      "seed",
    ];
    for (const f of expected) expect(params).toHaveProperty(f);
  });
});

// ── ablation locality ─────────────────────────────────────────────────────────

describe("spriteParams — ablation locality", () => {
  /**
   * For each aspect with exclusive ownership: perturbing ONLY that aspect changes
   * its owned params, and perturbing any OTHER aspect (that exclusively owns different
   * params) does NOT change those params.
   */

  const BASELINE_V = 0.5;
  const PERTURB = 0.3;

  for (const [aspect, ownedFields] of Object.entries(SPRITE_EXCLUSIVE) as [Aspect, readonly (keyof SpriteParams)[]][]) {
    it(`perturbing ${aspect} changes its exclusively-owned params (${ownedFields.join(", ")})`, () => {
      const base = spriteParams(soulOf(BASELINE_V));
      const perturbed = spriteParams(soulOf(BASELINE_V, { [aspect]: BASELINE_V + PERTURB }));
      for (const field of ownedFields) {
        expect(perturbed[field]).not.toEqual(base[field]);
      }
    });

    it(`perturbing ${aspect} does NOT change params exclusively owned by other aspects`, () => {
      const base = spriteParams(soulOf(BASELINE_V));
      const perturbed = spriteParams(soulOf(BASELINE_V, { [aspect]: BASELINE_V + PERTURB }));

      for (const [otherAspect, otherFields] of Object.entries(SPRITE_EXCLUSIVE) as [Aspect, readonly (keyof SpriteParams)[]][]) {
        if (otherAspect === aspect) continue;
        for (const field of otherFields) {
          expect(perturbed[field]).toEqual(base[field]);
        }
      }
    });
  }

  it("openness and intellect BOTH affect hue (shared multi-aspect param)", () => {
    const base = spriteParams(soulOf(0.5));
    const moreOpen = spriteParams(soulOf(0.5, { openness: 0.9 }));
    const moreIntellect = spriteParams(soulOf(0.5, { intellect: 0.9 }));
    expect(moreOpen.hue).not.toEqual(base.hue);
    expect(moreIntellect.hue).not.toEqual(base.hue);
  });

  it("wispCount flips at the enthusiasm threshold (0.45)", () => {
    const below = spriteParams(soulOf(0.5, { enthusiasm: 0.44 }));
    const above = spriteParams(soulOf(0.5, { enthusiasm: 0.46 }));
    expect(below.wispCount).toBe(4);
    expect(above.wispCount).toBe(6);
  });
});

// ── monotonicity ──────────────────────────────────────────────────────────────

describe("spriteParams — monotonicity", () => {
  function valuesFor(aspect: Aspect, param: keyof SpriteParams, steps: number[] = [0.1, 0.3, 0.5, 0.7, 0.9]) {
    return steps.map((v) => spriteParams(soulOf(0.5, { [aspect]: v }))[param] as number);
  }

  it("higher assertiveness → taller body (bodyScaleY monotone increasing)", () => {
    const vals = valuesFor("assertiveness", "bodyScaleY");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("lower orderliness → more puff jitter (puffJitter monotone increasing as orderliness drops)", () => {
    const vals = [0.9, 0.7, 0.5, 0.3, 0.1].map(
      (v) => spriteParams(soulOf(0.5, { orderliness: v })).puffJitter,
    );
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher withdrawal → eyes drop lower (eyeDropY monotone increasing)", () => {
    const vals = valuesFor("withdrawal", "eyeDropY");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher volatility → more shimmer (shimmer monotone increasing)", () => {
    const vals = valuesFor("volatility", "shimmer");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher enthusiasm → longer wisps (wispLengthFactor monotone increasing)", () => {
    const vals = valuesFor("enthusiasm", "wispLengthFactor");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher compassion → warmer blush (blush monotone increasing)", () => {
    const vals = valuesFor("compassion", "blush");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher politeness → more positive mouthCurve (monotone increasing)", () => {
    const vals = valuesFor("politeness", "mouthCurve");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher industriousness → higher saturation (monotone increasing)", () => {
    const vals = valuesFor("industriousness", "saturation");
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1] as number);
  });

  it("higher volatility scales tilt magnitude (|tilt| grows with volatility range)", () => {
    // With volatility increasing, tiltRange grows → |tilt| must grow proportionally.
    // The tiltUnit direction is fixed by birth seed (which is the same across these calls
    // since only v.volatility changes, not s). Use abs to be direction-agnostic.
    const soul = soulOf(0.5, {}, { s: { openness: 0.7, intellect: 0.6 } as Partial<AspectVector> });
    const absTilts = [0.1, 0.4, 0.7, 1.0].map((vol) => {
      const s = { ...soul, v: { ...soul.v, volatility: vol } };
      return Math.abs(spriteParams(s).tilt);
    });
    for (let i = 1; i < absTilts.length; i++) {
      expect(absTilts[i]).toBeGreaterThan(absTilts[i - 1] as number);
    }
  });
});

// ── stage mapping ─────────────────────────────────────────────────────────────

describe("spriteParams — stage mapping", () => {
  it("childhood soul has stageScale < 1.0 (small sprite)", () => {
    const child = spriteParams(soulOf(0.5, {}, { mp: 0 })); // mp=0 → childhood
    expect(child.stage).toBe("childhood");
    expect(child.stageScale).toBeLessThan(1.0);
  });

  it("early_adulthood soul has stageScale = 1.0 (full size)", () => {
    const adult = spriteParams(soulOf(0.5, {}, { mp: 300 })); // mp=300 → early_adulthood
    expect(adult.stage).toBe("early_adulthood");
    expect(adult.stageScale).toBe(1.0);
  });

  it("old_adulthood soul has stageScale < early_adulthood (dims + shrinks)", () => {
    const elder = spriteParams(soulOf(0.5, {}, { mp: 600 })); // mp=600 → old_adulthood
    expect(elder.stage).toBe("old_adulthood");
    expect(elder.stageScale).toBeLessThan(SPRITE_STAGE_SCALES.early_adulthood);
  });

  it("SPRITE_STAGE_SCALES covers all four stages and has the right order", () => {
    expect(SPRITE_STAGE_SCALES.childhood).toBeLessThan(SPRITE_STAGE_SCALES.early_adulthood);
    expect(SPRITE_STAGE_SCALES.old_adulthood).toBeLessThan(SPRITE_STAGE_SCALES.early_adulthood);
    for (const stage of ["childhood", "adolescence", "early_adulthood", "old_adulthood"] as const) {
      expect(SPRITE_STAGE_SCALES[stage]).toBeGreaterThan(0);
      expect(SPRITE_STAGE_SCALES[stage]).toBeLessThanOrEqual(1.0);
    }
  });
});

// ── birth-entropy seed ────────────────────────────────────────────────────────

describe("spriteParams — birth-entropy seed", () => {
  it("same soul → same seed (deterministic)", () => {
    const soul = soulOf(0.5, { openness: 0.7 });
    expect(spriteParams(soul).seed).toBe(spriteParams(soul).seed);
  });

  it("different set points → different seed (even with identical v)", () => {
    const soulA = soulOf(0.5, {}, { s: { openness: 0.8 } as Partial<AspectVector> });
    const soulB = soulOf(0.5, {}, { s: { openness: 0.3 } as Partial<AspectVector> });
    // v is the same; only s differs → seed should differ
    expect(spriteParams(soulA).seed).not.toBe(spriteParams(soulB).seed);
  });

  it("different tilt for uls with same v but different s (birth-entropy jitter)", () => {
    // The tilt direction is fixed by the birth seed. Two uls with the same aspect values
    // but different set points may have different tilt directions.
    const soulA = soulOf(0.6, { volatility: 0.8 }, { s: { openness: 0.9, assertiveness: 0.8 } as Partial<AspectVector> });
    const soulB = soulOf(0.6, { volatility: 0.8 }, { s: { openness: 0.1, assertiveness: 0.2 } as Partial<AspectVector> });
    // With these different seeds, tilts must differ (they use a deterministic RNG, not truly random)
    expect(spriteParams(soulA).seed).not.toBe(spriteParams(soulB).seed);
    // If seeds differ, tiltUnit will differ → tilts should differ
    expect(spriteParams(soulA).tilt).not.toBeCloseTo(spriteParams(soulB).tilt, 5);
  });
});

// ── spriteHash ────────────────────────────────────────────────────────────────

describe("spriteHash", () => {
  it("is deterministic and stable for the same state", () => {
    const soul = soulOf(0.5, { openness: 0.63 });
    expect(spriteHash(soul)).toBe(spriteHash(soul));
  });

  it("changes when a v value changes", () => {
    const before = spriteHash(soulOf(0.5, { openness: 0.6 }));
    const after = spriteHash(soulOf(0.5, { openness: 0.61 }));
    expect(before).not.toBe(after);
  });

  it("changes when mp changes (stage is sprite-relevant)", () => {
    const child = spriteHash(soulOf(0.5, {}, { mp: 0 }));
    const adult = spriteHash(soulOf(0.5, {}, { mp: 300 }));
    expect(child).not.toBe(adult);
  });

  it("changes when set points change (birth entropy is sprite-relevant)", () => {
    const a = spriteHash(soulOf(0.5, {}, { s: { openness: 0.8 } as Partial<AspectVector> }));
    const b = spriteHash(soulOf(0.5, {}, { s: { openness: 0.2 } as Partial<AspectVector> }));
    expect(a).not.toBe(b);
  });

  it("ignores non-rendered state (tension, lastUsedAt, accumulators)", () => {
    const base = soulOf(0.5, { openness: 0.6 });
    const noisy: Soul = {
      ...base,
      lastUsedAt: 123456789,
      tension: vec(0.9),
      a: vec(0.7),
    };
    expect(spriteHash(noisy)).toBe(spriteHash(base));
  });
});
