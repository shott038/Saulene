import { ASPECTS, type Aspect, type AspectVector, type Soul } from "@saulene/core";
import { describe, expect, it } from "vitest";
import {
  CROSSFADE_HALF_SAT,
  VOICE_BLOCK_SIZE,
  VOICE_FRAMING,
  type VoiceSampleInput,
  buildVoiceBlock,
  rankVoiceSamples,
  realFraction,
  render,
  syntheticExemplars,
} from "../src/index.js";

// ── builders (mirror renderer.test.ts) ──────────────────────────────────────────

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

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

function sample(
  text: string,
  state: AspectVector,
  ageSessions = 0,
  model = "claude-opus-4-8",
): VoiceSampleInput {
  return { text, state, provenance: { model, ageSessions } };
}

// The same banned-terms guard the floor uses — the framing + synthetic lines must respect it.
const BANNED_TERMS = [...ASPECTS, "agreeable", "conscientious", "neurotic", "extravert"];
function bannedHits(s: string): string[] {
  const lower = s.toLowerCase();
  return BANNED_TERMS.filter((t) => new RegExp(`\\b${t}\\b`, "i").test(lower));
}

describe("Layer 2 — no corpus is byte-identical Layer 1", () => {
  const soul = soulOf(0.5, { openness: 0.82, orderliness: 0.25, assertiveness: 0.7 });

  it("render(soul) === render(soul, {}) === render(soul, {voiceSamples: []})", () => {
    const a = render(soul);
    const b = render(soul, {});
    const c = render(soul, { voiceSamples: [] });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("emits an empty voiceBlock and leaves text == the Layer-1 floor", () => {
    const out = render(soul);
    expect(out.voiceBlock).toBe("");
    // text is just the floor: no framing line appended.
    expect(out.text).not.toContain(VOICE_FRAMING);
  });

  it("fragments are unchanged whether or not samples are supplied (ablation locality)", () => {
    const floor = render(soul);
    const withSamples = render(soul, {
      voiceSamples: [sample("Done. Shipping it.", soul.v)],
      corpusSize: 50,
    });
    expect(withSamples.fragments).toEqual(floor.fragments);
    expect(withSamples.soulHash).toEqual(floor.soulHash);
  });
});

describe("Layer 2 — few-shot block assembled", () => {
  const soul = soulOf(0.5, { openness: 0.8, assertiveness: 0.75 });

  it("text contains the voice block + the mandatory anti-quotation framing line", () => {
    const out = render(soul, {
      voiceSamples: [sample("Ship the boring path; it works.", soul.v)],
      corpusSize: 100,
    });
    expect(out.voiceBlock).not.toBe("");
    expect(out.text).toContain(VOICE_FRAMING);
    expect(out.text).toContain(out.voiceBlock);
    // the floor is still present, before the block.
    expect(out.text.indexOf("working defaults")).toBeLessThan(out.text.indexOf(VOICE_FRAMING));
  });

  it("a real sample's text appears verbatim when the corpus is dense", () => {
    const text = "Flip the pipeline; treat logs as truth.";
    const out = render(soul, { voiceSamples: [sample(text, soul.v)], corpusSize: 500 });
    expect(out.voiceBlock).toContain(text);
  });

  it("never leaks a trait name through the framing or synthetic exemplars", () => {
    const out = render(soul, { voiceSamples: [sample("x", soul.v)], corpusSize: 1 });
    expect(bannedHits(out.voiceBlock)).toEqual([]);
  });

  it("is deterministic: same (soul, opts) → byte-identical", () => {
    const opts = { voiceSamples: [sample("a", soul.v), sample("b", soul.v, 3)], corpusSize: 40 };
    expect(render(soul, opts)).toEqual(render(soul, opts));
  });
});

describe("Layer 2 — state-distance ordering", () => {
  const soul = soulOf(0.5, { openness: 0.9, withdrawal: 0.1 });

  it("ranks the nearer-to-current sample ahead of the far one", () => {
    const near = sample("near", soul.v); // identical state
    const far = sample("far", vec(0.1)); // far in aspect-space
    const ranked = rankVoiceSamples(soul, [far, near]);
    expect(ranked[0]?.text).toBe("near");
    expect(ranked[1]?.text).toBe("far");
  });

  it("prefers the nearer sample when only one real slot is available", () => {
    const near = sample("near-voice", soul.v);
    const far = sample("far-voice", vec(0.05));
    // small corpus → ~1 real slot; the nearer one must be the one that lands.
    const block = buildVoiceBlock(soul, { voiceSamples: [far, near], corpusSize: 4 });
    const realFrac = realFraction(4);
    const realSlots = Math.round(realFrac * VOICE_BLOCK_SIZE);
    expect(realSlots).toBeGreaterThanOrEqual(1);
    expect(block).toContain("near-voice");
  });
});

describe("Layer 2 — provenance / recency down-weighting", () => {
  const soul = soulOf(0.5);

  it("weights a fresh current-model sample above a stale old-model one at equal state", () => {
    const fresh = sample("fresh", soul.v, 0, "claude-opus-4-8");
    const stale = sample("stale", soul.v, 25, "claude-2");
    const ranked = rankVoiceSamples(soul, [stale, fresh]);
    expect(ranked[0]?.text).toBe("fresh");
  });

  it("down-weights an old-model sample at equal state + age (host-upgrade safety)", () => {
    // The freshest sample defines the host's current model. Among two samples identical in
    // state AND age, the one matching that model outranks the off-model one — model alone.
    const anchor = sample("anchor", soul.v, 0, "claude-opus-4-8"); // freshest → current model
    const current = sample("current-model", soul.v, 5, "claude-opus-4-8");
    const old = sample("old-model", soul.v, 5, "gpt-legacy");
    const ranked = rankVoiceSamples(soul, [old, current, anchor]);
    const ci = ranked.findIndex((r) => r.text === "current-model");
    const oi = ranked.findIndex((r) => r.text === "old-model");
    expect(ci).toBeLessThan(oi);
  });
});

describe("Layer 2 — cold-start crossfade", () => {
  const soul = soulOf(0.5, { openness: 0.85, assertiveness: 0.8, compassion: 0.75 });
  // a pool of distinct real samples, all near the current state
  const pool: VoiceSampleInput[] = Array.from({ length: VOICE_BLOCK_SIZE }, (_, i) =>
    sample(`real-${i}`, soul.v, 0),
  );
  const synth = syntheticExemplars(soul);
  const countReal = (block: string) => pool.filter((p) => block.includes(p.text)).length;
  const countSynth = (block: string) => synth.filter((s) => block.includes(`"${s}"`)).length;

  it("realFraction rises monotonically with corpus size, 0 at birth → →1 large", () => {
    expect(realFraction(0)).toBe(0);
    expect(realFraction(CROSSFADE_HALF_SAT)).toBeCloseTo(0.5, 10);
    const xs = [0, 5, 20, 100, 1000].map(realFraction);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1] as number);
    expect(realFraction(100000)).toBeGreaterThan(0.99);
  });

  it("small corpus → synthetic exemplars dominate the block", () => {
    const block = buildVoiceBlock(soul, { voiceSamples: pool, corpusSize: 2 });
    expect(countSynth(block)).toBeGreaterThan(countReal(block));
  });

  it("large corpus → real samples dominate the block", () => {
    const block = buildVoiceBlock(soul, { voiceSamples: pool, corpusSize: 2000 });
    expect(countReal(block)).toBeGreaterThan(countSynth(block));
  });

  it("the real share is non-decreasing as the corpus grows", () => {
    const reals = [1, 10, 50, 500].map((c) =>
      countReal(buildVoiceBlock(soul, { voiceSamples: pool, corpusSize: c })),
    );
    for (let i = 1; i < reals.length; i++)
      expect(reals[i]).toBeGreaterThanOrEqual(reals[i - 1] as number);
  });

  it("synthetic exemplars are derived from the soul's own strongest directives", () => {
    // openness is the most pronounced aspect here → its high-pole demo leads.
    expect(synth[0]).toBe(
      "What if we flip the whole pipeline and treat the logs as the source of truth?",
    );
  });
});
