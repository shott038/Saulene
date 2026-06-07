/**
 * @saulene/life-sim — closed-loop life driver tests
 *
 * All tests use fake LlmClients — zero real processes, zero network.
 * Covers: runClosedLoopLife shape, determinism, frozen mode, drifting vs frozen divergence.
 */

import { ASPECTS, seedFromEntropy } from "@saulene/core";
import type { Observation } from "@saulene/perception";
import { describe, expect, it } from "vitest";
import { runClosedLoopLife } from "../src/closed-loop.js";
import { SyntheticUser } from "../src/synthetic-user.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function makeSeed(n: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes[0] = n & 0xff;
  bytes[1] = (n >> 8) & 0xff;
  return bytes;
}

/** Injected virtual clock: base + n weeks. */
function makeWeeklyClock(base = FIXED_NOW) {
  return (i: number) => base + i * WEEK_MS;
}

/** Scripted fake LlmClient — round-robins through the provided responses. */
function fakeLlm(responses: string[]) {
  let i = 0;
  return {
    complete: async (_prompt: string) => responses[i++ % responses.length] ?? "ok",
  };
}

/** Build a fake perception JSON response that passes validateLedger (quote must be in transcript). */
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

/** A SyntheticUser whose fake LLM always says "user msg". */
function makeUser() {
  return new SyntheticUser(
    { persona: "creative-warm", workType: "deep-focus" },
    fakeLlm(["user msg"]),
  );
}

// ── runClosedLoopLife ─────────────────────────────────────────────────────────

describe("runClosedLoopLife", () => {
  it("returns the correct shape: birth, final, snapshots", async () => {
    const result = await runClosedLoopLife({
      seed: makeSeed(1),
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "industriousness")]),
      numSessions: 4,
      snapshotEvery: 2,
      turns: 1,
      clock: makeWeeklyClock(),
    });

    expect(result.birth).toBeDefined();
    expect(result.final).toBeDefined();
    expect(result.snapshots.length).toBeGreaterThanOrEqual(1);
    // Sessions 0, 2, 3 should be snapshots (every 2 + the last)
    const sessionIndices = result.snapshots.map((s) => s.sessionIndex);
    expect(sessionIndices).toContain(0);
    expect(sessionIndices).toContain(3); // final session always snapshotted
  });

  it("each snapshot has sessionIndex, virtualTime, soul, and transcript", async () => {
    const clock = makeWeeklyClock();
    const result = await runClosedLoopLife({
      seed: makeSeed(2),
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "openness")]),
      numSessions: 3,
      snapshotEvery: 3,
      turns: 1,
      clock,
    });

    const snap = result.snapshots[0];
    expect(snap).toBeDefined();
    if (snap) {
      expect(typeof snap.sessionIndex).toBe("number");
      expect(snap.virtualTime).toBe(clock(snap.sessionIndex));
      expect(snap.soul).toBeDefined();
      expect(snap.transcript).toBeDefined();
      expect(typeof snap.transcript.text).toBe("string");
    }
  });

  it("is deterministic for the same seed and fake LLMs", async () => {
    const opts = {
      seed: makeSeed(42),
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply a", "ul reply b"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "intellect")]),
      numSessions: 3,
      snapshotEvery: 1,
      turns: 1,
      clock: makeWeeklyClock(),
    };

    const resultA = await runClosedLoopLife({
      ...opts,
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply a", "ul reply b"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "intellect")]),
    });
    const resultB = await runClosedLoopLife({
      ...opts,
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply a", "ul reply b"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "intellect")]),
    });

    for (const aspect of ASPECTS) {
      expect(resultA.final.v[aspect]).toBeCloseTo(resultB.final.v[aspect], 8);
    }
  });

  it("frozen mode: v stays at birth values", async () => {
    const result = await runClosedLoopLife({
      seed: makeSeed(5),
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([fakePerceptionJson("user msg", "industriousness")]),
      numSessions: 8,
      snapshotEvery: 2,
      turns: 1,
      clock: makeWeeklyClock(),
      frozen: true,
    });

    // In frozen mode v must not move.
    for (const aspect of ASPECTS) {
      expect(result.final.v[aspect]).toBeCloseTo(result.birth.v[aspect], 6);
    }
  });

  it("drifting arm diverges from frozen arm after enough sessions", async () => {
    const seed = makeSeed(7);
    const obs = fakePerceptionJson("user msg", "industriousness");
    const baseOpts = {
      seed,
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([obs]),
      numSessions: 20,
      snapshotEvery: 5,
      turns: 1,
      clock: makeWeeklyClock(),
    };

    const drifting = await runClosedLoopLife({
      ...baseOpts,
      syntheticUser: makeUser(),
      perceptionLlm: fakeLlm([obs]),
    });
    const frozen = await runClosedLoopLife({
      ...baseOpts,
      syntheticUser: makeUser(),
      perceptionLlm: fakeLlm([obs]),
      frozen: true,
    });

    // At least one aspect should differ between drifting and frozen after 20 sessions.
    const diffs = ASPECTS.map((a) => Math.abs(drifting.final.v[a] - frozen.final.v[a]));
    const maxDiff = Math.max(...diffs);
    expect(maxDiff).toBeGreaterThan(0);
  });

  it("birth soul is the same for the same seed regardless of frozen", async () => {
    const seed = makeSeed(3);
    const obs = fakePerceptionJson("user msg", "openness");

    const drifting = await runClosedLoopLife({
      seed,
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([obs]),
      numSessions: 2,
      snapshotEvery: 2,
      turns: 1,
      clock: makeWeeklyClock(),
    });
    const frozen = await runClosedLoopLife({
      seed,
      syntheticUser: makeUser(),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([obs]),
      numSessions: 2,
      snapshotEvery: 2,
      turns: 1,
      clock: makeWeeklyClock(),
      frozen: true,
    });

    for (const aspect of ASPECTS) {
      expect(drifting.birth.v[aspect]).toBeCloseTo(frozen.birth.v[aspect], 8);
    }
  });
});
