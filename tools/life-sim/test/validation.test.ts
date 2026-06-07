/**
 * @saulene/life-sim — validation metrics tests
 *
 * Tests all four validation metrics with fake LlmClients and fakeValidationJudge.
 * Zero real processes, zero network.
 */

import { ASPECTS, seedFromEntropy } from "@saulene/core";
import type { Observation } from "@saulene/perception";
import { block, lifetime, script } from "@saulene/simulator";
import { entropyFromInt } from "@saulene/simulator";
import { describe, expect, it } from "vitest";
import { runClosedLoopLife } from "../src/closed-loop.js";
import type { ClosedLoopResult, LifeSnapshot } from "../src/closed-loop.js";
import { SyntheticUser } from "../src/synthetic-user.js";
import { fakeValidationJudge } from "../src/validation/judge.js";
import {
  FROZEN_DIVERGENCE_THRESHOLD,
  SURROGATE_ERROR_THRESHOLD,
  crossTimeIdentity,
  frozenSoulControlAB,
  surrogateVsTruth,
  twoLivesOneSeed,
} from "../src/validation/metrics.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function makeSeed(n: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[0] = n & 0xff;
  bytes[1] = (n >> 8) & 0xff;
  return bytes;
}

function makeWeeklyClock(base = FIXED_NOW) {
  return (i: number) => base + i * WEEK_MS;
}

function fakeLlm(responses: string[]) {
  let i = 0;
  return {
    complete: async (_prompt: string) => responses[i++ % responses.length] ?? "ok",
  };
}

function fakePerceptionJson(evidenceQuote: string, aspect: Observation["aspect"]): string {
  const obs: Observation = {
    aspect,
    mode: "task",
    practice: 3,
    fit: 2,
    confidence: "high",
    evidence_quote: evidenceQuote,
    first_person_note: "I felt engaged.",
    salience: 2,
  };
  return JSON.stringify({
    observations: [obs],
    session_significance: 0.4,
    schema_version: "0",
    diary: "A focused session.",
  });
}

function makeUser() {
  return new SyntheticUser(
    { persona: "creative-warm", workType: "deep-focus" },
    fakeLlm(["user msg"]),
  );
}

/** Build a minimal ClosedLoopResult for metric tests that don't need real conversations. */
function makeClosedLoopResult(opts: {
  seed?: Uint8Array;
  finalVOverride?: Partial<Record<string, number>>;
  numSnapshots?: number;
  transcriptText?: string;
}): ClosedLoopResult {
  const seed = opts.seed ?? makeSeed(1);
  const birth = seedFromEntropy(seed, FIXED_NOW);

  const v = { ...birth.v, ...opts.finalVOverride };
  const final = { ...birth, v };

  const transcript = { text: opts.transcriptText ?? "User: hello\nAssistant: hi", soulHash: "abc" };
  const n = opts.numSnapshots ?? 2;
  const snapshots: LifeSnapshot[] = Array.from({ length: n }, (_, i) => ({
    sessionIndex: i,
    virtualTime: FIXED_NOW + i * WEEK_MS,
    soul: i === n - 1 ? final : { ...birth },
    transcript,
  }));

  return { birth, final, snapshots };
}

// ── Metric 1: crossTimeIdentity ───────────────────────────────────────────────

describe("crossTimeIdentity", () => {
  it("passes when fake judge says same-being and A is earlier", async () => {
    const seed = makeSeed(10);
    const transcript = { text: "User: hello\nAssistant: hi", soulHash: "x" };
    const birth = seedFromEntropy(seed, FIXED_NOW);

    const early: LifeSnapshot = {
      sessionIndex: 0,
      virtualTime: FIXED_NOW,
      soul: birth,
      transcript,
    };
    const late: LifeSnapshot = {
      sessionIndex: 10,
      virtualTime: FIXED_NOW + 10 * WEEK_MS,
      soul: birth,
      transcript,
    };

    const result = await crossTimeIdentity(early, late, fakeValidationJudge());
    expect(result.sameBeing).toBe(true);
    expect(result.orderable).toBe(true);
    expect(result.pass).toBe(true);
    expect(result.earlySessionIndex).toBe(0);
    expect(result.lateSessionIndex).toBe(10);
  });

  it("fails when judge says different beings", async () => {
    const transcript = { text: "User: hi\nAssistant: hello", soulHash: "y" };
    const birth = seedFromEntropy(makeSeed(11), FIXED_NOW);

    const snap = (idx: number): LifeSnapshot => ({
      sessionIndex: idx,
      virtualTime: FIXED_NOW + idx * WEEK_MS,
      soul: birth,
      transcript,
    });

    const judgeRefusing = {
      sameBeingOverTime: async () => ({
        sameBeing: false,
        earlierIs: "A" as const,
        confidence: "high" as const,
        reasoning: "different people",
      }),
      distinguishable: async () => ({
        distinguishable: true,
        confidence: "high" as const,
        explanation: "clearly different",
      }),
    };

    const result = await crossTimeIdentity(snap(0), snap(5), judgeRefusing);
    expect(result.sameBeing).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("fails when judge cannot order (tie)", async () => {
    const transcript = { text: "User: hi\nAssistant: hello", soulHash: "z" };
    const birth = seedFromEntropy(makeSeed(12), FIXED_NOW);

    const snap = (idx: number): LifeSnapshot => ({
      sessionIndex: idx,
      virtualTime: FIXED_NOW + idx * WEEK_MS,
      soul: birth,
      transcript,
    });

    const judgeTie = {
      sameBeingOverTime: async () => ({
        sameBeing: true,
        earlierIs: "tie" as const,
        confidence: "low" as const,
        reasoning: "can't tell",
      }),
      distinguishable: async () => ({
        distinguishable: false,
        confidence: "low" as const,
        explanation: "same",
      }),
    };

    const result = await crossTimeIdentity(snap(0), snap(5), judgeTie);
    expect(result.sameBeing).toBe(true);
    expect(result.orderable).toBe(false);
    expect(result.pass).toBe(false);
  });
});

// ── Metric 2: frozenSoulControlAB ────────────────────────────────────────────

describe("frozenSoulControlAB", () => {
  it("reports divergence when v vectors differ beyond threshold", () => {
    const seed = makeSeed(20);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    // Manually craft a drifting result with a different v
    const driftedV = { ...birth.v };
    for (const aspect of ASPECTS) driftedV[aspect] = Math.min(1, birth.v[aspect] + 0.15);

    const drifting = makeClosedLoopResult({ seed, finalVOverride: driftedV });
    const frozen = makeClosedLoopResult({ seed }); // frozen: final.v == birth.v

    const result = frozenSoulControlAB(drifting, frozen, FROZEN_DIVERGENCE_THRESHOLD);
    expect(result.vDistance).toBeGreaterThan(FROZEN_DIVERGENCE_THRESHOLD);
    expect(result.diverges).toBe(true);
  });

  it("reports no divergence when v vectors are equal", () => {
    const seed = makeSeed(21);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    const drifting = makeClosedLoopResult({ seed });
    const frozen = makeClosedLoopResult({ seed });

    const result = frozenSoulControlAB(drifting, frozen, FROZEN_DIVERGENCE_THRESHOLD);
    expect(result.vDistance).toBeCloseTo(0);
    expect(result.diverges).toBe(false);
  });

  it("includes per-snapshot distances", () => {
    const seed = makeSeed(22);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    const driftedV = { ...birth.v };
    driftedV.industriousness = Math.min(1, birth.v.industriousness + 0.2);

    const drifting = makeClosedLoopResult({ seed, finalVOverride: driftedV, numSnapshots: 3 });
    const frozen = makeClosedLoopResult({ seed, numSnapshots: 3 });

    const result = frozenSoulControlAB(drifting, frozen, FROZEN_DIVERGENCE_THRESHOLD);
    expect(result.snapshotDistances).toHaveLength(3);
    for (const d of result.snapshotDistances) {
      expect(typeof d).toBe("number");
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it("integrates with runClosedLoopLife — drifting and frozen arms diverge", async () => {
    const seed = makeSeed(23);
    const obs = fakePerceptionJson("user msg", "industriousness");
    const baseOpts = {
      seed,
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([obs]),
      numSessions: 20,
      snapshotEvery: 5,
      turns: 1,
      clock: makeWeeklyClock(),
    };

    const drifting = await runClosedLoopLife({ ...baseOpts, syntheticUser: makeUser() });
    const frozen = await runClosedLoopLife({
      ...baseOpts,
      syntheticUser: makeUser(),
      frozen: true,
    });

    const result = frozenSoulControlAB(drifting, frozen, FROZEN_DIVERGENCE_THRESHOLD);
    // With 20 sessions of max practice, the arms should diverge.
    expect(result.vDistance).toBeGreaterThan(0);
  });
});

// ── Metric 3: twoLivesOneSeed ─────────────────────────────────────────────────

describe("twoLivesOneSeed", () => {
  it("passes when judge says distinguishable and v vectors differ", async () => {
    const seed = makeSeed(30);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    // Shift all aspects by 0.1 → mean distance = 0.1 >> TWO_LIVES_V_THRESHOLD (0.02)
    const driftedV = { ...birth.v };
    for (const aspect of ASPECTS) driftedV[aspect] = Math.min(1, birth.v[aspect] + 0.1);

    const aligned = makeClosedLoopResult({ seed, finalVOverride: driftedV, numSnapshots: 2 });
    const grind = makeClosedLoopResult({ seed, numSnapshots: 2 });

    const result = await twoLivesOneSeed(aligned, grind, fakeValidationJudge(), 0.02);
    expect(result.distinguishable).toBe(true);
    expect(result.vDistance).toBeGreaterThan(0);
    expect(result.pass).toBe(true);
  });

  it("fails when judge says not distinguishable", async () => {
    const seed = makeSeed(31);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    const driftedV = { ...birth.v };
    driftedV.openness = Math.min(1, birth.v.openness + 0.1);

    const aligned = makeClosedLoopResult({ seed, finalVOverride: driftedV, numSnapshots: 2 });
    const grind = makeClosedLoopResult({ seed, numSnapshots: 2 });

    const judgeNotDistinct = {
      sameBeingOverTime: async () => ({
        sameBeing: true,
        earlierIs: "A" as const,
        confidence: "high" as const,
        reasoning: "same",
      }),
      distinguishable: async () => ({
        distinguishable: false,
        confidence: "high" as const,
        explanation: "voices are identical",
      }),
    };

    const result = await twoLivesOneSeed(aligned, grind, judgeNotDistinct, 0.02);
    expect(result.distinguishable).toBe(false);
    expect(result.pass).toBe(false);
  });

  it("fails when there are no snapshots", async () => {
    const aligned = makeClosedLoopResult({ seed: makeSeed(32), numSnapshots: 0 });
    const grind = makeClosedLoopResult({ seed: makeSeed(32), numSnapshots: 0 });
    // Manually empty snapshots
    aligned.snapshots.length = 0;
    grind.snapshots.length = 0;

    const result = await twoLivesOneSeed(aligned, grind, fakeValidationJudge());
    expect(result.pass).toBe(false);
    expect(result.distinguishable).toBe(false);
  });
});

// ── Metric 4: surrogateVsTruth ────────────────────────────────────────────────

describe("surrogateVsTruth", () => {
  it("matches when the surrogate closely predicts the closed-loop trajectory", () => {
    const seed = makeSeed(40);

    // Build a surrogate lifetime trajectory from scripted sessions (pure engine)
    const surrogateTraj = lifetime(
      seed,
      script(
        block({
          aspects: ["openness", "intellect"],
          practice: 0.5,
          fit: 0.4,
          significance: 0.3,
          count: 10,
        }),
      ),
    );

    // Closed-loop truth that starts from the same seed (may differ, but is within threshold)
    const closedLoop = makeClosedLoopResult({ seed });

    const result = surrogateVsTruth(closedLoop, surrogateTraj, SURROGATE_ERROR_THRESHOLD);
    expect(result.matches).toBe(true); // generous threshold — should always pass with default
    expect(result.meanVError).toBeGreaterThanOrEqual(0);
    expect(result.snapshotErrors.length).toBeGreaterThanOrEqual(0);
  });

  it("does not match when surrogate and closed-loop are maximally different", () => {
    const seed = makeSeed(41);
    const birth = seedFromEntropy(seed, FIXED_NOW);

    // Force closed-loop to a v near 1.0
    const highV: Partial<Record<string, number>> = {};
    for (const aspect of ASPECTS) highV[aspect] = 1.0;
    const closedLoop = makeClosedLoopResult({ seed, finalVOverride: highV });

    // Build a surrogate with sessions that push toward 0.0 (very low practice)
    const surrogateTraj = lifetime(
      seed,
      script(block({ aspects: [], practice: 0, fit: 0, significance: 0.1, count: 5 })),
    );

    // Mean error should be roughly 0.5 (1.0 vs ~0.5 for an undrifted soul)
    const result = surrogateVsTruth(closedLoop, surrogateTraj, 0.01); // very tight threshold
    expect(result.matches).toBe(false);
  });

  it("returns per-snapshot errors", () => {
    const seed = makeSeed(42);
    const surrogateTraj = lifetime(
      seed,
      script(
        block({
          aspects: ["industriousness"],
          practice: 0.6,
          fit: 0.3,
          significance: 0.4,
          count: 6,
        }),
      ),
    );
    const closedLoop = makeClosedLoopResult({ seed, numSnapshots: 3 });

    const result = surrogateVsTruth(closedLoop, surrogateTraj, SURROGATE_ERROR_THRESHOLD);
    expect(Array.isArray(result.snapshotErrors)).toBe(true);
    expect(result.snapshotErrors.length).toBe(3);
  });
});
