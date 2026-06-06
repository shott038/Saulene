/**
 * The Phase 2 acceptance test (the deliverable the SPEC names): one birth seed, two lives.
 *
 * Same `seed`. One ul lives an ALIGNED life — it exercises the aspects it is good at and enjoys
 * (high practice, high fit) — and flourishes along its nature. A second ul, born from the SAME
 * seed, lives a MISMATCHED GRIND — it hammers a domain it has no nature for and hates (high
 * practice, strongly negative fit) — which charges tension to repeated breaking points; being
 * clay, those breaks reconfigure it toward the lived direction. The two adults end genuinely
 * different, and the trajectory lets us narrate exactly why.
 *
 * We assert the MECHANISM produces divergence, NOT specific magnitudes — knobs are untuned
 * placeholders (Phase 3 tunes them). Where divergence needs surfacing we make the scripts more
 * EXTREME, never touch `core` or the knob defaults (per the mission's scope discipline).
 *
 * The `console.log` narration is part of the proof — run with `vitest --reporter=verbose` (or read
 * the captured output) to see the "born X → became Y, because…" story for each life.
 */

import { DEFAULT_KNOBS } from "@saulene/core";
import { describe, expect, it } from "vitest";
import { block, entropyFromInt, lifetime, narrate, script } from "../src/index.js";

// Lifespan: significance 1.0 every session ages at the rate cap, so ~320 sessions carry the ul
// from birth through old adulthood (bands 100/250/500 MP, ≤3 MP/session). Long enough for a full
// life; symmetric across both scripts so only the SIGNAL differs, never the clock.
const LIFE = 320;
const SIG = 1.0;

// A clay ul (stubbornness ≈ 0.08), born INTP: high Openness/Intellect (N), low
// Industriousness/Orderliness (P). Found by search over birth entropy — NOT a tuned knob, just a
// representative ul whose nature makes "grind the thing it has no nature for" a genuine mismatch.
const CLAY_SEED = entropyFromInt(230);
// A stubborn ul (stubbornness ≈ 0.89), also born with low Industriousness/Orderliness — the
// temperament contrast that routes an identical grind the opposite way (hardens, not reconfigures).
const STUBBORN_SEED = entropyFromInt(10);

const CONTESTED = ["industriousness", "orderliness"] as const;

/** Aligned life: reinforce what the ul is good at and enjoys (high practice, high fit). */
const ALIGNED = script(
  block({
    aspects: ["openness", "intellect"],
    practice: 1,
    fit: 1,
    significance: SIG,
    count: LIFE,
  }),
);

/** Mismatched grind: hammer the contested domain it has no nature for and hates. */
const GRIND = script(
  block({ aspects: [...CONTESTED], practice: 1, fit: -1, significance: SIG, count: LIFE }),
);

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const contestedV = (v: Record<string, number>): number => sum(CONTESTED.map((a) => v[a] ?? 0));

describe("Phase 2 acceptance: same birth seed, two lives → two different adults", () => {
  it("aligned life flourishes; the same seed under a mismatched grind breaks and reconfigures", () => {
    const aligned = lifetime(CLAY_SEED, ALIGNED, DEFAULT_KNOBS);
    const grind = lifetime(CLAY_SEED, GRIND, DEFAULT_KNOBS);

    // Same birth — the divergence is purely lived, not seeded.
    expect(grind.birth.v).toEqual(aligned.birth.v);
    expect(grind.birth.stubbornness).toBe(aligned.birth.stubbornness);

    // The mechanism: a high-fit life never charges tension, so it never ruptures; the grind does.
    expect(aligned.breaks.length).toBe(0);
    expect(grind.breaks.length).toBeGreaterThan(0);

    // The contested domain ends meaningfully higher under the grind (the clay reconfigured toward
    // what it was forced to live), while the aligned life leaves it near its low birth value.
    const divergence = contestedV(grind.final.v) - contestedV(aligned.final.v);
    expect(divergence).toBeGreaterThan(0.3);

    // Two different adults at the readable layer: the lived life flipped the MBTI readout.
    const alignedMbti = aligned.snapshots.at(-1)?.mbti;
    const grindMbti = grind.snapshots.at(-1)?.mbti;
    expect(grindMbti).not.toBe(alignedMbti);

    // ── The narration IS the proof. Print the "why" for each life. ──
    console.log(
      `\n${narrate(aligned, { title: "ALIGNED LIFE", contested: CONTESTED })}\n\n${narrate(grind, { title: "MISMATCHED GRIND", contested: CONTESTED })}\n`,
    );
  });

  it("the break is routed by temperament: clay reconfigures, stubborn hardens (resents)", () => {
    // The same grind, two temperaments — this is the "routed by stubbornness" half of the why.
    const clay = lifetime(CLAY_SEED, GRIND, DEFAULT_KNOBS);
    const stubborn = lifetime(STUBBORN_SEED, GRIND, DEFAULT_KNOBS);

    const clayRise = clay.final.v.industriousness - clay.birth.v.industriousness;
    const stubbornRise = stubborn.final.v.industriousness - stubborn.birth.v.industriousness;

    // Clay's disposition migrates toward the grind far more than the stubborn ul's, which resists.
    expect(clayRise).toBeGreaterThan(stubbornRise + 0.2);

    // Stubborn's resistance is mechanically visible: each break deepens the homeward pull
    // (betaGain rises with resentment); clay gains little to none.
    expect(stubborn.final.betaGain.industriousness).toBeGreaterThan(
      clay.final.betaGain.industriousness,
    );
    expect(stubborn.final.betaGain.industriousness).toBeGreaterThan(1);

    const fx = (n: number): string => n.toFixed(2);
    console.log(
      `\nSAME GRIND, TWO TEMPERAMENTS:\n  clay     (stub ${fx(clay.birth.stubbornness)}): Industriousness ${fx(clay.birth.v.industriousness)} → ${fx(clay.final.v.industriousness)} (reconfigured toward the grind), betaGain ×${clay.final.betaGain.industriousness.toFixed(1)}\n  stubborn (stub ${fx(stubborn.birth.stubbornness)}): Industriousness ${fx(stubborn.birth.v.industriousness)} → ${fx(stubborn.final.v.industriousness)} (held its nature, resented), betaGain ×${stubborn.final.betaGain.industriousness.toFixed(1)}\n`,
    );
  });
});
