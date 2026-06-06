import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ASPECTS, type AspectVector, type Soul, seedFromEntropy } from "@saulene/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type LedgerRowInput,
  StorageError,
  type VoiceSampleInput,
  appendDiary,
  appendLedger,
  appendVoiceSample,
  aspectDistance,
  diaryPath,
  loadSoul,
  nearestVoiceSamples,
  readDiary,
  readLedger,
  readVoiceSamples,
  saveSoul,
  soulPath,
  voicePath,
} from "../src/index.js";

// Every test runs against a fresh temp root under os.tmpdir(). The real home is NEVER touched.
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-storage-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Deterministic entropy → a real, valid soul (no clock, no randomness).
const entropy = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const mintSoul = (now = 1_700_000_000_000): Soul => seedFromEntropy(entropy, now);

function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

const ledgerRow = (over: Partial<LedgerRowInput> = {}): LedgerRowInput => ({
  sessionId: "s1",
  timestamp: 1,
  aspect: "openness",
  mode: "task",
  practice: 2,
  fit: 1,
  confidence: "med",
  evidenceQuote: "let's try the weirder approach",
  firstPersonNote: "I leaned into the strange idea.",
  salience: 2,
  ...over,
});

const voiceSample = (over: Partial<VoiceSampleInput> = {}): VoiceSampleInput => ({
  sessionId: "s1",
  timestamp: 1,
  text: "yeah, let's just rip the band-aid off and refactor it.",
  state: vec(0.5),
  provenance: { model: "claude-opus-4-8", version: "2026-06" },
  ...over,
});

describe("soul round-trip", () => {
  it("saveSoul then loadSoul returns an equal soul", () => {
    const soul = mintSoul();
    saveSoul(root, soul);
    expect(loadSoul(root)).toEqual(soul);
  });

  it("a seeded soul survives a round-trip byte-for-byte", () => {
    const soul = mintSoul();
    saveSoul(root, soul);
    const firstBytes = readFileSync(soulPath(root), "utf8");
    const reloaded = loadSoul(root);
    expect(reloaded).not.toBeNull();
    saveSoul(root, reloaded as Soul);
    expect(readFileSync(soulPath(root), "utf8")).toBe(firstBytes);
  });
});

describe("atomic write", () => {
  it("a save leaves no leftover temp file", () => {
    saveSoul(root, mintSoul());
    expect(existsSync(`${soulPath(root)}.tmp`)).toBe(false);
  });

  it("a leftover temp file from a crashed write doesn't clobber the good soul", () => {
    const good = mintSoul();
    saveSoul(root, good);
    // Simulate a crash mid-write: a partial temp file exists, but the rename never happened.
    writeFileSync(`${soulPath(root)}.tmp`, "{ partial, not valid json", "utf8");
    // The real soul.json is untouched and still loads clean.
    expect(loadSoul(root)).toEqual(good);
  });
});

describe("malformed = loud, missing = clean", () => {
  it("a missing soul file is a clean null (no soul yet), not an error", () => {
    expect(loadSoul(root)).toBeNull();
  });

  it("a hand-corrupted (invalid JSON) soul.json throws StorageError", () => {
    const p = soulPath(root);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "{ this is not json", "utf8");
    expect(() => loadSoul(root)).toThrow(StorageError);
  });

  it("a structurally-invalid soul.json throws StorageError (zod validation)", () => {
    saveSoul(root, mintSoul());
    const obj = JSON.parse(readFileSync(soulPath(root), "utf8"));
    const { migrationBudget: _dropped, ...soulMissingField } = obj.soul; // drop a required field
    obj.soul = soulMissingField;
    writeFileSync(soulPath(root), JSON.stringify(obj), "utf8");
    expect(() => loadSoul(root)).toThrow(StorageError);
  });

  it("an out-of-range aspect value throws (boundary validation, not silent load)", () => {
    saveSoul(root, mintSoul());
    const obj = JSON.parse(readFileSync(soulPath(root), "utf8"));
    obj.soul.v.openness = 2; // > 1, outside [0,1]
    writeFileSync(soulPath(root), JSON.stringify(obj), "utf8");
    expect(() => loadSoul(root)).toThrow(StorageError);
  });
});

describe("append + full history", () => {
  it("ledger rows read back in append order with schemaVersion stamped", () => {
    appendLedger(root, ledgerRow({ aspect: "openness", salience: 1 }));
    appendLedger(root, ledgerRow({ aspect: "compassion", salience: 3 }));
    const rows = readLedger(root);
    expect(rows.map((r) => r.aspect)).toEqual(["openness", "compassion"]);
    expect(rows.every((r) => r.schemaVersion === 1)).toBe(true);
  });

  it("diary entries read back in append order", () => {
    appendDiary(root, { sessionId: "s1", timestamp: 1, text: "first day, felt curious." });
    appendDiary(root, { sessionId: "s2", timestamp: 2, text: "pushed back more today." });
    expect(readDiary(root).map((d) => d.text)).toEqual([
      "first day, felt curious.",
      "pushed back more today.",
    ]);
  });

  it("history is retained across many appends (nothing overwritten)", () => {
    for (let i = 0; i < 25; i++) appendLedger(root, ledgerRow({ timestamp: i, salience: 1 }));
    expect(readLedger(root)).toHaveLength(25);
  });
});

describe("label wall — diary and voice physically separate", () => {
  it("diary and voice samples live in different files under different dirs", () => {
    appendDiary(root, { sessionId: "s1", timestamp: 1, text: "a memory." });
    appendVoiceSample(root, voiceSample({ text: "a voice sample." }));

    expect(diaryPath(root)).not.toBe(voicePath(root));
    expect(dirname(diaryPath(root))).not.toBe(dirname(voicePath(root)));
    expect(existsSync(diaryPath(root))).toBe(true);
    expect(existsSync(voicePath(root))).toBe(true);
  });

  it("diary content never appears in the voice shelf and vice-versa", () => {
    appendDiary(root, { sessionId: "s1", timestamp: 1, text: "DIARY_ONLY_MARKER memory." });
    appendVoiceSample(root, voiceSample({ text: "VOICE_ONLY_MARKER form." }));

    const diaryBytes = readFileSync(diaryPath(root), "utf8");
    const voiceBytes = readFileSync(voicePath(root), "utf8");
    expect(diaryBytes).toContain("DIARY_ONLY_MARKER");
    expect(diaryBytes).not.toContain("VOICE_ONLY_MARKER");
    expect(voiceBytes).toContain("VOICE_ONLY_MARKER");
    expect(voiceBytes).not.toContain("DIARY_ONLY_MARKER");
  });
});

describe("retrieval by state-distance", () => {
  it("aspectDistance is L2 over the 10 aspects", () => {
    // a single aspect off by 0.3 → distance 0.3; all-zero vs all-0.1 → sqrt(10)*0.1.
    expect(aspectDistance(vec(0.5), { ...vec(0.5), openness: 0.8 })).toBeCloseTo(0.3, 12);
    expect(aspectDistance(vec(0), vec(0.1))).toBeCloseTo(Math.sqrt(10) * 0.1, 12);
  });

  it("nearestVoiceSamples returns the k closest, nearest first", () => {
    appendVoiceSample(root, voiceSample({ text: "far", state: vec(0.9) }));
    appendVoiceSample(root, voiceSample({ text: "near", state: vec(0.55) }));
    appendVoiceSample(root, voiceSample({ text: "mid", state: vec(0.7) }));

    const got = nearestVoiceSamples(root, vec(0.5), 2);
    expect(got.map((s) => s.text)).toEqual(["near", "mid"]);
  });

  it("k larger than the shelf returns the whole shelf sorted; k<=0 returns []", () => {
    appendVoiceSample(root, voiceSample({ text: "a", state: vec(0.6) }));
    appendVoiceSample(root, voiceSample({ text: "b", state: vec(0.51) }));
    expect(nearestVoiceSamples(root, vec(0.5), 10).map((s) => s.text)).toEqual(["b", "a"]);
    expect(nearestVoiceSamples(root, vec(0.5), 0)).toEqual([]);
  });
});

describe("provenance + quality gate", () => {
  it("voice samples carry model/version provenance", () => {
    appendVoiceSample(root, voiceSample({ provenance: { model: "m", version: "v2" } }));
    const [s] = readVoiceSamples(root);
    expect(s?.provenance).toEqual({ model: "m", version: "v2" });
  });

  it("the default quality gate rejects empty-text samples (not appended)", () => {
    const ok = appendVoiceSample(root, voiceSample({ text: "   " }));
    expect(ok).toBe(false);
    expect(readVoiceSamples(root)).toHaveLength(0);
  });

  it("a custom quality gate is a seam that can reject", () => {
    const gate = (s: { text: string }) => s.text.includes("keep");
    expect(appendVoiceSample(root, voiceSample({ text: "drop this" }), { gate })).toBe(false);
    expect(appendVoiceSample(root, voiceSample({ text: "keep this" }), { gate })).toBe(true);
    expect(readVoiceSamples(root)).toHaveLength(1);
  });
});
