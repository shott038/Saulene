/**
 * @saulene/life-sim — unit tests
 *
 * All tests use fake LlmClients — zero real processes, zero network.
 * Covers: SyntheticUser, conversation runner, ledgerToSignals parity,
 * CorpusLedgerSource determinism, bucket helpers, fingerprint pipeline.
 */

import { seedFromEntropy } from "@saulene/core";
import { type Observation, ledgerToSignals } from "@saulene/perception";
import { describe, expect, it } from "vitest";
import { allBuckets, classifyState } from "../src/buckets.js";
import { runConversation } from "../src/conversation.js";
import { runFingerprintSession } from "../src/fingerprint.js";
import {
  CorpusLedgerSource,
  type CorpusRecord,
  SeededRng,
  parseCorpus,
  serializeRecord,
} from "../src/ledger-source.js";
import { SyntheticUser } from "../src/synthetic-user.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000;

function makeSoul() {
  const entropy = new Uint8Array(32);
  entropy[0] = 0x42;
  return seedFromEntropy(entropy, FIXED_NOW);
}

/** Scripted fake LlmClient — returns turns in round-robin order. */
function fakeLlm(responses: string[]) {
  let i = 0;
  return {
    complete: async (_prompt: string) => responses[i++ % responses.length] ?? "default response",
  };
}

function sampleObs(aspect: Observation["aspect"], practice: number, fit: number): Observation {
  return {
    aspect,
    mode: "task",
    practice,
    fit,
    confidence: "high",
    evidence_quote: "I spent the whole session on this.",
    first_person_note: "I felt engaged and absorbed.",
    salience: 2,
  };
}

// ── ledgerToSignals parity ────────────────────────────────────────────────────

describe("ledgerToSignals (parity)", () => {
  it("normalizes practice 0–3 to 0–1", () => {
    const obs = [sampleObs("industriousness", 3, 0)];
    const { practice } = ledgerToSignals(obs);
    expect(practice.industriousness).toBeCloseTo(1.0);
  });

  it("normalizes fit −3..+3 to −1..+1", () => {
    const obs = [sampleObs("orderliness", 0, -3)];
    const { fit } = ledgerToSignals(obs);
    expect(fit.orderliness).toBeCloseTo(-1.0);
  });

  it("averages across two modes for the same aspect", () => {
    const obs: Observation[] = [
      { ...sampleObs("openness", 3, 3), mode: "task" },
      { ...sampleObs("openness", 0, -3), mode: "interaction" },
    ];
    const { practice, fit } = ledgerToSignals(obs);
    expect(practice.openness).toBeCloseTo(0.5);
    expect(fit.openness).toBeCloseTo(0.0);
  });

  it("leaves unexercised aspects absent", () => {
    const obs = [sampleObs("intellect", 2, 1)];
    const { practice } = ledgerToSignals(obs);
    expect(practice.industriousness).toBeUndefined();
    expect(practice.intellect).toBeDefined();
  });
});

// ── Bucket helpers ────────────────────────────────────────────────────────────

describe("allBuckets", () => {
  it("produces 240 buckets (4 personas × 5 workTypes × 4 stages × 3 stateBuckets)", () => {
    expect(allBuckets()).toHaveLength(4 * 5 * 4 * 3);
  });

  it("each bucket has all four axes", () => {
    const buckets = allBuckets();
    const b = buckets[0] ?? { persona: "", workType: "", stage: "", stateBucket: "" };
    expect(b).toHaveProperty("persona");
    expect(b).toHaveProperty("workType");
    expect(b).toHaveProperty("stage");
    expect(b).toHaveProperty("stateBucket");
  });
});

describe("classifyState", () => {
  it("returns a valid stateBucket for a real soul", () => {
    const soul = makeSoul();
    const bucket = classifyState(soul);
    expect(["high-energy", "neutral", "depleted"]).toContain(bucket);
  });
});

// ── SyntheticUser ─────────────────────────────────────────────────────────────

describe("SyntheticUser", () => {
  it("returns the llm's response as the user turn", async () => {
    const user = new SyntheticUser(
      { persona: "creative-warm", workType: "deep-focus" },
      fakeLlm(["Hello, can you help me?"]),
    );
    const msg = await user.turn({
      turnIndex: 0,
      totalTurns: 3,
      sessionIndex: 0,
      history: [],
    });
    expect(msg).toBe("Hello, can you help me?");
  });

  it("includes persona description in the prompt (indirectly via response)", async () => {
    let capturedPrompt = "";
    const spy = {
      complete: async (p: string) => {
        capturedPrompt = p;
        return "response";
      },
    };
    const user = new SyntheticUser({ persona: "technical-curt", workType: "admin" }, spy);
    await user.turn({ turnIndex: 0, totalTurns: 2, sessionIndex: 0, history: [] });
    expect(capturedPrompt).toContain("direct");
  });
});

// ── Conversation runner ───────────────────────────────────────────────────────

describe("runConversation", () => {
  it("produces a transcript with the expected number of turns", async () => {
    const soul = makeSoul();
    const user = new SyntheticUser(
      { persona: "analytical-reserved", workType: "learning" },
      fakeLlm(["What is this?", "Tell me more.", "Got it, thanks."]),
    );
    const ulLlm = fakeLlm(["I can help with that.", "Here is more detail.", "You're welcome."]);

    const transcript = await runConversation(user, soul, ulLlm, { turns: 3 });

    expect(transcript.text).toContain("User:");
    expect(transcript.text).toContain("Assistant:");
    // 3 user turns → 3 exchanges
    expect(transcript.text.split("User:").length - 1).toBe(3);
    // soulHash is non-empty
    expect(transcript.soulHash.length).toBeGreaterThan(0);
  });

  it("defaults to 3 turns", async () => {
    const soul = makeSoul();
    const user = new SyntheticUser(
      { persona: "creative-warm", workType: "collaboration" },
      fakeLlm(["msg"]),
    );
    const transcript = await runConversation(user, soul, fakeLlm(["reply"]));
    expect(transcript.text.split("User:").length - 1).toBe(3);
  });
});

// ── Fingerprint pipeline ──────────────────────────────────────────────────────

describe("runFingerprintSession", () => {
  it("returns a CorpusRecord with the correct bucket", async () => {
    const soul = makeSoul();
    const bucket = allBuckets()[0] ?? {
      persona: "creative-warm" as const,
      workType: "deep-focus" as const,
      stage: "childhood" as const,
      stateBucket: "neutral" as const,
    };

    // The evidence_quote must appear verbatim in the transcript produced by fake LLMs.
    // Transcript format: "User: user msg\nAssistant: ul reply\n..."
    const obsWithQuote: Observation = {
      ...sampleObs("industriousness", 2, 1),
      evidence_quote: "user msg",
    };
    const fakeObs = JSON.stringify({
      observations: [obsWithQuote],
      session_significance: 0.3,
      schema_version: "0",
      diary: "A decent session.",
    });

    const record = await runFingerprintSession(bucket, soul, {
      userLlm: fakeLlm(["user msg"]),
      ulLlm: fakeLlm(["ul reply"]),
      perceptionLlm: fakeLlm([fakeObs]),
      model: "test-model",
    });

    expect(record.bucket).toEqual(bucket);
    expect(record.meta.model).toBe("test-model");
    expect(record.ledger.observations).toHaveLength(1);
    expect(record.ledger.sessionSignificance).toBeCloseTo(0.3);
  });
});

// ── CorpusLedgerSource ────────────────────────────────────────────────────────

describe("CorpusLedgerSource", () => {
  function makeRecord(
    persona: CorpusRecord["bucket"]["persona"],
    workType: CorpusRecord["bucket"]["workType"],
  ): CorpusRecord {
    return {
      bucket: { persona, workType, stage: "early_adulthood", stateBucket: "neutral" },
      ledger: {
        observations: [sampleObs("industriousness", 3, 2)],
        sessionSignificance: 0.5,
      },
      meta: { soulHash: "abc", model: "test" },
    };
  }

  it("returns a ScriptedSession with the correct shape", () => {
    const records = [makeRecord("creative-warm", "deep-focus")];
    const source = new CorpusLedgerSource(records, new SeededRng(42));
    const soul = makeSoul();
    const session = source.next(soul, {
      persona: "creative-warm",
      workType: "deep-focus",
      sessionIndex: 0,
    });
    expect(session).toHaveProperty("practice");
    expect(session).toHaveProperty("fit");
    expect(session).toHaveProperty("significance");
  });

  it("is deterministic for the same seed", () => {
    const records = [
      makeRecord("creative-warm", "deep-focus"),
      makeRecord("creative-warm", "learning"),
    ];
    const soul = makeSoul();
    const ctx = {
      persona: "creative-warm" as const,
      workType: "deep-focus" as const,
      sessionIndex: 0,
    };
    const a = new CorpusLedgerSource(records, new SeededRng(99)).next(soul, ctx);
    const b = new CorpusLedgerSource(records, new SeededRng(99)).next(soul, ctx);
    expect(a).toEqual(b);
  });

  it("falls back to all records when no persona match", () => {
    const records = [makeRecord("technical-curt", "admin")];
    const source = new CorpusLedgerSource(records, new SeededRng(1));
    const soul = makeSoul();
    const session = source.next(soul, {
      persona: "creative-warm",
      workType: "deep-focus",
      sessionIndex: 0,
    });
    expect(session.significance).toBeGreaterThan(0);
  });
});

// ── SeededRng ─────────────────────────────────────────────────────────────────

describe("SeededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = new SeededRng(12345);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = new SeededRng(77);
    const b = new SeededRng(77);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
});

// ── Corpus serialization ──────────────────────────────────────────────────────

describe("corpus serialization", () => {
  it("round-trips through serializeRecord + parseCorpus", () => {
    const record: CorpusRecord = {
      bucket: {
        persona: "creative-warm",
        workType: "deep-focus",
        stage: "early_adulthood",
        stateBucket: "neutral",
      },
      ledger: { observations: [sampleObs("intellect", 2, 1)], sessionSignificance: 0.4 },
      meta: { soulHash: "deadbeef", model: "haiku" },
    };
    const jsonl = `${serializeRecord(record)}\n`;
    const [parsed] = parseCorpus(jsonl);
    expect(parsed).toEqual(record);
  });
});
