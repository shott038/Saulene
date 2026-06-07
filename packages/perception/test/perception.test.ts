import { ASPECTS } from "@saulene/core";
import { describe, expect, it } from "vitest";
import {
  type LlmClient,
  type Observation,
  ObservationSchema,
  PerceptionError,
  RUBRIC,
  SCHEMA_VERSION,
  type SessionJudgment,
  SessionJudgmentSchema,
  perceive,
  perceiveDetailed,
  toJsonSchema,
  validateLedger,
} from "../src/index.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

const TRANSCRIPT = [
  "I spent the whole session refactoring the parser until every test went green.",
  "It was a long grind but I didn't want to stop — I lost myself in it.",
  'The user said: "this is exactly the cleanup I wanted, nice work".',
].join("\n");

/** A complete, valid observation built from overrides. */
function obs(overrides: Partial<Observation> = {}): Observation {
  return {
    aspect: "industriousness",
    mode: "task",
    practice: 3,
    fit: 2,
    confidence: "high",
    evidence_quote: "I spent the whole session refactoring the parser until every test went green.",
    first_person_note: "I lost myself in the grind and didn't want to stop.",
    salience: 2,
    ...overrides,
  };
}

function judgment(observations: Observation[]): SessionJudgment {
  return {
    observations,
    session_significance: 0.4,
    schema_version: SCHEMA_VERSION,
    diary: "Today I got lost in a satisfying refactor.",
  };
}

/** A scripted fake — returns whatever canned string it was constructed with. */
function fakeLlm(response: string): LlmClient {
  return { complete: async () => response };
}

// ── schema round-trips ──────────────────────────────────────────────────────────

describe("schema", () => {
  it("parses a valid judgment", () => {
    const parsed = SessionJudgmentSchema.safeParse(judgment([obs()]));
    expect(parsed.success).toBe(true);
  });

  it("rejects out-of-range ordinals (practice 5, fit 9)", () => {
    const bad = SessionJudgmentSchema.safeParse(judgment([obs({ practice: 5 as 3, fit: 9 as 3 })]));
    expect(bad.success).toBe(false);
  });

  it("derives a JSON schema from the same zod definition (no drift)", () => {
    const json = toJsonSchema(SessionJudgmentSchema) as {
      type: string;
      required: string[];
      properties: Record<string, { type?: string; items?: unknown }>;
    };
    expect(json.type).toBe("object");
    expect(json.required).toEqual(
      expect.arrayContaining(["observations", "session_significance", "schema_version", "diary"]),
    );
    expect(json.properties.observations.type).toBe("array");

    const obsJson = toJsonSchema(ObservationSchema) as {
      required: string[];
      properties: Record<
        string,
        { type?: string; enum?: string[]; minimum?: number; maximum?: number }
      >;
    };
    // The aspect enum mirrors core's 10 aspects exactly.
    expect(obsJson.properties.aspect.enum).toEqual([...ASPECTS]);
    // Bounded anchored ordinals survive into the contract.
    expect(obsJson.properties.practice).toMatchObject({ type: "integer", minimum: 0, maximum: 3 });
    expect(obsJson.properties.fit).toMatchObject({ type: "integer", minimum: -3, maximum: 3 });
    // Optional enrichment fields are NOT required.
    expect(obsJson.required).not.toContain("goal_congruence");
    expect(obsJson.required).toContain("evidence_quote");
  });
});

// ── quote gate (anti-hallucination) ───────────────────────────────────────────────

describe("validateLedger — quote gate", () => {
  it("accepts an observation whose quote IS present verbatim", () => {
    const res = validateLedger(judgment([obs()]), TRANSCRIPT);
    expect(res.valid).toBe(true);
    expect(res.rejected).toHaveLength(0);
    expect(res.cleaned.observations).toHaveLength(1);
  });

  it("rejects an observation whose quote is NOT in the transcript", () => {
    const res = validateLedger(
      judgment([obs({ evidence_quote: "I never said this sentence at all." })]),
      TRANSCRIPT,
    );
    expect(res.valid).toBe(false);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0].reason).toMatch(/verbatim/);
    expect(res.cleaned.observations).toHaveLength(0);
  });

  it("is strict — a paraphrase (not exact substring) is rejected", () => {
    const res = validateLedger(
      judgment([obs({ evidence_quote: "I refactored the parser until tests went green." })]),
      TRANSCRIPT,
    );
    expect(res.valid).toBe(false);
  });
});

// ── first-person lock (no-mirror) ─────────────────────────────────────────────────

describe("validateLedger — first-person lock", () => {
  it("rejects a note that profiles the user ('you are…')", () => {
    const res = validateLedger(
      judgment([obs({ first_person_note: "You are clearly a meticulous engineer." })]),
      TRANSCRIPT,
    );
    expect(res.valid).toBe(false);
    expect(res.rejected[0].reason).toMatch(/no-mirror/);
  });

  it("rejects a note that references the user in third person", () => {
    const res = validateLedger(
      judgment([obs({ first_person_note: "I could tell the user was satisfied." })]),
      TRANSCRIPT,
    );
    expect(res.valid).toBe(false);
  });

  it("accepts a genuine 'I…' note", () => {
    const res = validateLedger(
      judgment([obs({ first_person_note: "I felt completely absorbed in the work." })]),
      TRANSCRIPT,
    );
    expect(res.valid).toBe(true);
  });
});

// ── sparse, not force-filled ──────────────────────────────────────────────────────

describe("sparseness", () => {
  it("a 2-aspect session yields a handful of observations, not 10", () => {
    const sparse = judgment([
      obs({ aspect: "industriousness" }),
      obs({
        aspect: "openness",
        evidence_quote: "I lost myself in it.",
        first_person_note: "I enjoyed exploring the cleaner shape.",
      }),
    ]);
    const res = validateLedger(sparse, TRANSCRIPT);
    expect(res.valid).toBe(true);
    expect(res.cleaned.observations.length).toBeLessThan(ASPECTS.length);
    expect(res.cleaned.observations).toHaveLength(2);
  });
});

// ── perceive() end-to-end ─────────────────────────────────────────────────────────

describe("perceive (pipeline)", () => {
  const cannedGood = JSON.stringify(judgment([obs()]));

  it("turns canned JSON into a validated SessionJudgment", async () => {
    const result = await perceive(TRANSCRIPT, fakeLlm(cannedGood));
    expect(result.observations).toHaveLength(1);
    expect(result.schema_version).toBe(SCHEMA_VERSION);
    expect(result.diary).toBeTypeOf("string");
  });

  // Real models (esp. cheap ones via `claude -p`) wrap JSON in a ```json fence or add prose,
  // despite the prompt asking for bare JSON. Caught by the first live golden run; must not regress.
  it("tolerates a ```json markdown fence around the output", async () => {
    const fenced = `\`\`\`json\n${cannedGood}\n\`\`\``;
    const result = await perceive(TRANSCRIPT, fakeLlm(fenced));
    expect(result.observations).toHaveLength(1);
  });

  it("tolerates a line of prose before the JSON object", async () => {
    const withProse = `Here is the analysis:\n${cannedGood}`;
    const result = await perceive(TRANSCRIPT, fakeLlm(withProse));
    expect(result.observations).toHaveLength(1);
  });

  it("strips a row whose quote is hallucinated (does not throw)", async () => {
    const canned = JSON.stringify(
      judgment([
        obs(),
        obs({ aspect: "openness", evidence_quote: "fabricated line not in transcript" }),
      ]),
    );
    const { judgment: out, rejected } = await perceiveDetailed(TRANSCRIPT, fakeLlm(canned));
    expect(out.observations).toHaveLength(1);
    expect(out.observations[0].aspect).toBe("industriousness");
    expect(rejected).toHaveLength(1);
  });

  it("stamps the authoritative schema_version even if the model lies about it", async () => {
    const lying = JSON.stringify(judgment([obs()]).valueOf());
    const tampered = lying.replace(SCHEMA_VERSION, "totally-made-up-version");
    const out = await perceive(TRANSCRIPT, fakeLlm(tampered));
    expect(out.schema_version).toBe(SCHEMA_VERSION);
  });

  it("throws PerceptionError on non-JSON output", async () => {
    await expect(perceive(TRANSCRIPT, fakeLlm("not json at all"))).rejects.toBeInstanceOf(
      PerceptionError,
    );
  });

  it("throws PerceptionError on JSON that fails the schema", async () => {
    const malformed = JSON.stringify({ observations: "nope", session_significance: 2 });
    await expect(perceive(TRANSCRIPT, fakeLlm(malformed))).rejects.toBeInstanceOf(PerceptionError);
  });

  it("includes the rubric and transcript in the prompt it sends", async () => {
    let seen = "";
    const spy: LlmClient = {
      complete: async (p) => {
        seen = p;
        return cannedGood;
      },
    };
    await perceive(TRANSCRIPT, spy);
    expect(seen).toContain(RUBRIC);
    expect(seen).toContain(TRANSCRIPT);
    // Extract-first ordering is stated in the prompt.
    expect(seen).toMatch(/FIRST extract/);
  });
});

// ── determinism ───────────────────────────────────────────────────────────────────

describe("determinism", () => {
  it("same transcript + same fake → identical judgment", async () => {
    const canned = JSON.stringify(judgment([obs(), obs({ aspect: "intellect" })]));
    const a = await perceive(TRANSCRIPT, fakeLlm(canned));
    const b = await perceive(TRANSCRIPT, fakeLlm(canned));
    expect(a).toEqual(b);
  });
});
