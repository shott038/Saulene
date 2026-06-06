import { ASPECTS, type Aspect, type AspectVector, type Soul } from "@saulene/core";
import { describe, expect, it } from "vitest";
import {
  INTENSITY_LADDER,
  RENDERER_VERSION,
  intensityTier,
  render,
  renderFragment,
  soulHash,
} from "../src/index.js";

// ── soul builders ─────────────────────────────────────────────────────────────
// Only `v` reaches the Layer-1 floor; the rest is filled to satisfy the Soul type.

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

/** A soul whose aspect values are `base` everywhere, with `overrides` applied on top. */
function soulOf(base: number, overrides: Partial<AspectVector> = {}): Soul {
  const v = vec(base);
  for (const [a, val] of Object.entries(overrides)) v[a as Aspect] = val as number;
  return {
    v,
    s: vec(0.5),
    a: vec(0),
    tension: vec(0),
    disuseAnchor: vec(0.5),
    refractory: vec(0),
    betaGain: vec(1),
    migrationBudget: 0.1,
    stubbornness: 0.5,
    sex: "female",
    mp: 0,
    lastUsedAt: 0,
  };
}

const BANNED_TERMS = [
  // the 10 aspect names …
  ...ASPECTS,
  // … plus obvious synonyms / Big-Five domain words the guardrail forbids (style, not self-report).
  "open",
  "open-minded",
  "intellectual",
  "intelligent",
  "intelligence",
  "smart",
  "cerebral",
  "industrious",
  "hardworking",
  "hard-working",
  "diligent",
  "orderly",
  "organized",
  "organised",
  "tidy",
  "neat",
  "enthusiastic",
  "excited",
  "exciting",
  "excitement",
  "extravert",
  "extraverted",
  "extrovert",
  "extraversion",
  "assertive",
  "dominant",
  "dominance",
  "compassionate",
  "empathy",
  "empathetic",
  "empathic",
  "kind",
  "caring",
  "polite",
  "courteous",
  "courtesy",
  "respectful",
  "deferential",
  "withdrawn",
  "anxious",
  "anxiety",
  "neurotic",
  "neuroticism",
  "fearful",
  "volatile",
  "moody",
  "irritable",
  "temperamental",
  "agreeable",
  "agreeableness",
  "conscientious",
  "conscientiousness",
];

function bannedHits(s: string): string[] {
  const lower = s.toLowerCase();
  return BANNED_TERMS.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(lower));
}

describe("render — determinism / golden file", () => {
  it("is byte-identical across calls (pure)", () => {
    const soul = soulOf(0.5, { openness: 0.7, volatility: 0.3, assertiveness: 0.9 });
    expect(render(soul)).toEqual(render(soul));
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
    });
    const out = render(soul);
    expect(out.text).toMatchSnapshot();
    expect(out.soulHash).toMatchSnapshot();
    expect(RENDERER_VERSION).toMatchSnapshot();
  });

  it("exposes one fragment per aspect, each assembled into text", () => {
    const out = render(soulOf(0.6));
    expect(Object.keys(out.fragments).sort()).toEqual([...ASPECTS].sort());
    for (const a of ASPECTS) expect(out.text).toContain(out.fragments[a]);
  });
});

describe("render — no literal trait names (hard guardrail)", () => {
  it("never leaks an aspect name or obvious synonym, across the value range", () => {
    for (const base of [0.0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]) {
      const out = render(soulOf(base));
      expect(bannedHits(out.text)).toEqual([]);
      for (const a of ASPECTS) expect(bannedHits(out.fragments[a])).toEqual([]);
    }
  });

  it("never leaks a trait name when interaction clauses fire", () => {
    // low orderliness + high industriousness + firm/open + warm/blunt all active.
    const out = render(
      soulOf(0.5, {
        orderliness: 0.2,
        industriousness: 0.8,
        assertiveness: 0.75,
        politeness: 0.7,
        compassion: 0.75,
      }),
    );
    expect(bannedHits(out.text)).toEqual([]);
  });
});

describe("render — continuous, not banded", () => {
  it("a small Δ on one aspect changes that aspect's fragment (drift stays visible)", () => {
    const a = render(soulOf(0.5, { openness: 0.6 }));
    const b = render(soulOf(0.5, { openness: 0.71 }));
    expect(a.fragments.openness).not.toEqual(b.fragments.openness);
  });

  it("does not collapse the range into a few coarse bands", () => {
    // Distinct fragments across the high pole — far more than 3 buckets.
    const seen = new Set<string>();
    for (let v = 0.5; v <= 1.0001; v += 0.05)
      seen.add(renderFragment("compassion", Math.min(v, 1)));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe("render — ablation locality + monotonicity", () => {
  it("perturbing one aspect changes only that aspect's fragment", () => {
    const baseline = render(soulOf(0.5));
    const perturbed = render(soulOf(0.5, { assertiveness: 0.8 }));
    expect(perturbed.fragments.assertiveness).not.toEqual(baseline.fragments.assertiveness);
    for (const a of ASPECTS) {
      if (a === "assertiveness") continue;
      expect(perturbed.fragments[a]).toEqual(baseline.fragments[a]);
    }
  });

  it("intensity rises monotonically with the value within a pole", () => {
    const tiers = [0.55, 0.65, 0.75, 0.85, 0.95].map(intensityTier);
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i]).toBeGreaterThan(tiers[i - 1] as number);
    }
  });

  it("a ±0.10 perturbation always shifts the fragment (ablation metric relies on it)", () => {
    for (const v of [0.55, 0.65, 0.75, 0.85]) {
      expect(renderFragment("enthusiasm", v)).not.toEqual(renderFragment("enthusiasm", v + 0.1));
    }
  });

  it("crossing the midline flips the directive pole", () => {
    const low = renderFragment("politeness", 0.3);
    const high = renderFragment("politeness", 0.7);
    expect(low).not.toEqual(high);
    // tiers are equal magnitude either side of 0.5, so the difference is the POLE, not intensity.
    expect(intensityTier(0.3)).toEqual(intensityTier(0.7));
  });
});

describe("soulHash", () => {
  it("is deterministic and stable for the same state", () => {
    const soul = soulOf(0.5, { openness: 0.63 });
    expect(soulHash(soul)).toEqual(soulHash(soul));
  });

  it("changes when a rendered-relevant value changes", () => {
    const before = soulHash(soulOf(0.5, { openness: 0.6 }));
    const after = soulHash(soulOf(0.5, { openness: 0.61 }));
    expect(before).not.toEqual(after);
  });

  it("ignores non-rendered state (age does not move the floor)", () => {
    const a = soulOf(0.5, { openness: 0.6 });
    const b: Soul = { ...a, mp: 999, lastUsedAt: 123456, tension: vec(0.5) };
    expect(soulHash(b)).toEqual(soulHash(a));
  });
});

describe("framing", () => {
  it("emits no '## Personality' header (labeled blocks read as revertible metadata)", () => {
    const text = render(soulOf(0.6)).text;
    expect(text).not.toMatch(/##\s*Personality/i);
    expect(text.trimStart().startsWith("#")).toBe(false);
  });

  it("ladder has enough rungs for continuous rendering", () => {
    expect(INTENSITY_LADDER.length).toBeGreaterThanOrEqual(10);
  });
});
