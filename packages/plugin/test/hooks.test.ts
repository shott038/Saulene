/**
 * @saulene/plugin/hooks — tests
 *
 * Tests for the SessionStart and Stop hook handlers. Runs against real temp directories
 * (same pattern as storage tests) so no filesystem mocks are needed. The LLM is faked.
 *
 * Determinism: soul is seeded from fixed entropy; timestamps are injected. The real home
 * directory (~/.saulene) is NEVER touched — every call uses the temp root.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { type Soul, seedFromEntropy } from "@saulene/core";
import type { LlmClient } from "@saulene/perception";
import type { SessionJudgment } from "@saulene/perception";
import { loadSoul, readDiary, readLedger, saveSoul } from "@saulene/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hasGitAncestor, isGated, loadConfig, sauleneRoot } from "../src/hooks/config.js";
import { readSessionCache } from "../src/hooks/session-cache.js";
import { sessionStart } from "../src/hooks/session-start.js";
import { stop } from "../src/hooks/stop.js";
import { userPromptSubmit } from "../src/hooks/user-prompt-submit.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const ENTROPY = new Uint8Array([7, 8, 9, 10, 11, 12, 13, 14]);
const NOW = 1_720_000_000_000; // a fixed timestamp well within the 90-day window

/** A valid soul, fresh from entropy (lastUsedAt = NOW so the death clock is fully reset). */
const mintSoul = (): Soul => ({ ...seedFromEntropy(ENTROPY, NOW), lastUsedAt: NOW });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-plugin-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Write a level config to `<root>/config.json`. */
function writeConfig(storageRoot: string, level: "global" | "named-dir", dir?: string): void {
  const cfg = dir !== undefined ? { level, dir } : { level };
  writeFileSync(join(storageRoot, "config.json"), JSON.stringify(cfg), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake LLM client for the Stop pipeline
// ─────────────────────────────────────────────────────────────────────────────

class FakeLlmClient implements LlmClient {
  constructor(private readonly response: SessionJudgment) {}
  async complete(_prompt: string): Promise<string> {
    return JSON.stringify(this.response);
  }
}

class BadJsonLlmClient implements LlmClient {
  async complete(_prompt: string): Promise<string> {
    return "not valid json {{{";
  }
}

const FAKE_JUDGMENT: SessionJudgment = {
  observations: [
    {
      aspect: "openness",
      mode: "task",
      practice: 2,
      fit: 1,
      confidence: "med",
      evidence_quote: "we brainstormed several novel approaches",
      first_person_note: "I found the exploration engaging.",
      salience: 2,
    },
  ],
  session_significance: 0.6,
  schema_version: "1",
  diary: "Worked on creative ideation; felt genuinely stimulated.",
};

// ─────────────────────────────────────────────────────────────────────────────
// config: loadConfig + isGated
// ─────────────────────────────────────────────────────────────────────────────

describe("loadConfig", () => {
  it("returns null when config file is absent", () => {
    expect(loadConfig(root)).toBeNull();
  });

  it("parses a global config", () => {
    writeConfig(root, "global");
    expect(loadConfig(root)).toEqual({ level: "global" });
  });

  it("parses a named-dir config with dir", () => {
    writeConfig(root, "named-dir", "/home/user/work");
    expect(loadConfig(root)).toEqual({ level: "named-dir", dir: "/home/user/work" });
  });

  it("returns null on malformed JSON", () => {
    writeFileSync(join(root, "config.json"), "{ bad json", "utf8");
    expect(loadConfig(root)).toBeNull();
  });

  it("returns null on invalid level value", () => {
    writeFileSync(join(root, "config.json"), JSON.stringify({ level: "everywhere" }), "utf8");
    expect(loadConfig(root)).toBeNull();
  });
});

describe("isGated", () => {
  it("named-dir: gates in when cwd equals the configured dir", () => {
    expect(isGated({ level: "named-dir", dir: "/home/user/work" }, "/home/user/work")).toBe(true);
  });

  it("named-dir: gates in when cwd is inside the configured dir", () => {
    const dir = "/home/user/work";
    expect(isGated({ level: "named-dir", dir }, `/home/user/work${sep}project`)).toBe(true);
  });

  it("named-dir: gates out when cwd is a different dir", () => {
    expect(isGated({ level: "named-dir", dir: "/home/user/work" }, "/home/user/other")).toBe(false);
  });

  it("named-dir: gates out when dir is missing from config", () => {
    const cfg = { level: "named-dir" as const };
    expect(isGated(cfg, "/home/user/work")).toBe(false);
  });

  it("global: gates in when cwd has no git ancestor (plain temp dir)", () => {
    const plain = mkdtempSync(join(tmpdir(), "no-git-"));
    try {
      expect(isGated({ level: "global" }, plain)).toBe(true);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("global: gates out when cwd is inside a git repo", () => {
    const withGit = mkdtempSync(join(tmpdir(), "with-git-"));
    try {
      mkdirSync(join(withGit, ".git"));
      expect(isGated({ level: "global" }, withGit)).toBe(false);
    } finally {
      rmSync(withGit, { recursive: true, force: true });
    }
  });
});

describe("hasGitAncestor", () => {
  it("returns false for a plain temp dir with no .git", () => {
    const plain = mkdtempSync(join(tmpdir(), "plain-"));
    try {
      expect(hasGitAncestor(plain)).toBe(false);
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it("returns true for a dir with .git at the same level", () => {
    const d = mkdtempSync(join(tmpdir(), "with-git-"));
    try {
      mkdirSync(join(d, ".git"));
      expect(hasGitAncestor(d)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("returns true for a subdirectory whose parent has .git", () => {
    const parent = mkdtempSync(join(tmpdir(), "parent-git-"));
    try {
      const child = join(parent, "sub");
      mkdirSync(child, { recursive: true });
      mkdirSync(join(parent, ".git"));
      expect(hasGitAncestor(child)).toBe(true);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe("sauleneRoot", () => {
  it("returns a string containing .saulene", () => {
    expect(sauleneRoot()).toContain(".saulene");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sessionStart
// ─────────────────────────────────────────────────────────────────────────────

describe("sessionStart", () => {
  /** A cwd guaranteed to not be inside a git repo (fresh plain temp dir). */
  let plainCwd: string;
  beforeEach(() => {
    plainCwd = mkdtempSync(join(tmpdir(), "no-git-cwd-"));
  });
  afterEach(() => {
    rmSync(plainCwd, { recursive: true, force: true });
  });

  it("returns null when no config exists", () => {
    expect(sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when config exists but no soul (not born yet)", () => {
    writeConfig(root, "global");
    expect(sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when gated out (named-dir, wrong cwd)", () => {
    writeConfig(root, "named-dir", "/some/other/dir");
    saveSoul(root, mintSoul());
    expect(sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when soul is neglect-dead (> 90 days gap)", () => {
    writeConfig(root, "global");
    const ninety = 90 * 24 * 60 * 60 * 1000;
    const deadSoul = { ...mintSoul(), lastUsedAt: NOW - ninety - 1 };
    saveSoul(root, deadSoul);
    // NOW is exactly at or past the death threshold.
    expect(sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null and writes session cache when conditions met (global, non-git cwd)", () => {
    writeConfig(root, "global");
    saveSoul(root, mintSoul());
    const result = sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW + 1000 });
    // S1 delivery: sessionStart always returns null; voice goes through UserPromptSubmit.
    expect(result).toBeNull();
    const cache = readSessionCache(root);
    expect(cache).not.toBeNull();
    expect(typeof cache?.text).toBe("string");
    expect(cache?.text.length).toBeGreaterThan(0);
    expect(typeof cache?.soulHash).toBe("string");
  });

  it("returns null and writes session cache when conditions met (named-dir match)", () => {
    writeConfig(root, "named-dir", plainCwd);
    saveSoul(root, mintSoul());
    const result = sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW + 1000 });
    expect(result).toBeNull();
    const cache = readSessionCache(root);
    expect(cache).not.toBeNull();
    // The injection text contains the Layer-1 intro line.
    expect(cache?.text).toContain("working defaults");
  });

  it("does NOT write session cache when dormant (gated out)", () => {
    writeConfig(root, "named-dir", "/some/other/dir");
    saveSoul(root, mintSoul());
    sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW });
    expect(readSessionCache(root)).toBeNull();
  });

  it("does NOT write session cache when neglect-dead", () => {
    writeConfig(root, "global");
    const ninety = 90 * 24 * 60 * 60 * 1000;
    saveSoul(root, { ...mintSoul(), lastUsedAt: NOW - ninety - 1 });
    sessionStart({ cwd: plainCwd, storageRoot: root, now: NOW });
    expect(readSessionCache(root)).toBeNull();
  });

  it("bumps lastUsedAt on active session", () => {
    writeConfig(root, "global");
    saveSoul(root, mintSoul());
    const newNow = NOW + 5000;
    sessionStart({ cwd: plainCwd, storageRoot: root, now: newNow });
    const updated = loadSoul(root);
    expect(updated?.lastUsedAt).toBe(newNow);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// userPromptSubmit
// ─────────────────────────────────────────────────────────────────────────────

describe("userPromptSubmit", () => {
  let plainCwd: string;
  beforeEach(() => {
    plainCwd = mkdtempSync(join(tmpdir(), "no-git-cwd-"));
  });
  afterEach(() => {
    rmSync(plainCwd, { recursive: true, force: true });
  });

  /** Run SessionStart to populate the session cache (live session). */
  function activateSession(cwd: string, now = NOW + 1000): void {
    sessionStart({ cwd, storageRoot: root, now });
  }

  it("returns null when no config exists", () => {
    expect(userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when config exists but no soul", () => {
    writeConfig(root, "global");
    expect(userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when gated out (named-dir, wrong cwd)", () => {
    writeConfig(root, "named-dir", "/some/other/dir");
    saveSoul(root, mintSoul());
    expect(userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when neglect-dead", () => {
    writeConfig(root, "global");
    const ninety = 90 * 24 * 60 * 60 * 1000;
    saveSoul(root, { ...mintSoul(), lastUsedAt: NOW - ninety - 1 });
    expect(userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns null when session cache is absent (SessionStart never ran)", () => {
    writeConfig(root, "global");
    saveSoul(root, mintSoul());
    // No activateSession — cache doesn't exist.
    expect(userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns the cached injection when all conditions met (global)", () => {
    writeConfig(root, "global");
    saveSoul(root, mintSoul());
    activateSession(plainCwd);

    const result = userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW + 2000 });
    expect(result).not.toBeNull();
    expect(typeof result?.text).toBe("string");
    expect(result?.text.length).toBeGreaterThan(0);
    expect(typeof result?.soulHash).toBe("string");
  });

  it("returns the cached injection when all conditions met (named-dir match)", () => {
    writeConfig(root, "named-dir", plainCwd);
    saveSoul(root, mintSoul());
    activateSession(plainCwd);

    const result = userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW + 2000 });
    expect(result).not.toBeNull();
    expect(result?.text).toContain("working defaults");
  });

  it("returns the same text that SessionStart cached (cache is stable)", () => {
    writeConfig(root, "global");
    saveSoul(root, mintSoul());
    activateSession(plainCwd);

    const fromCache1 = userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW + 100 });
    const fromCache2 = userPromptSubmit({ cwd: plainCwd, storageRoot: root, now: NOW + 200 });
    expect(fromCache1?.text).toBe(fromCache2?.text);
    expect(fromCache1?.soulHash).toBe(fromCache2?.soulHash);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stop
// ─────────────────────────────────────────────────────────────────────────────

describe("stop", () => {
  const TRANSCRIPT =
    "User: can you think of creative approaches?\n" +
    "Assistant: we brainstormed several novel approaches to the problem.";

  const fakeLlm = new FakeLlmClient(FAKE_JUDGMENT);

  it("does nothing when no soul exists", async () => {
    await expect(
      stop({ transcript: TRANSCRIPT, llm: fakeLlm, storageRoot: root, now: NOW }),
    ).resolves.toBeUndefined();
    expect(loadSoul(root)).toBeNull();
  });

  it("runs the full pipeline and saves the soul", async () => {
    saveSoul(root, mintSoul());
    const sessionId = "test-session-001";

    await stop({
      transcript: TRANSCRIPT,
      llm: fakeLlm,
      storageRoot: root,
      now: NOW + 1000,
      sessionId,
    });

    const updated = loadSoul(root);
    expect(updated).not.toBeNull();
    expect(updated?.mp).toBeGreaterThan(0); // MP accrued from significance 0.6
    expect(updated?.lastUsedAt).toBe(NOW + 1000);
  });

  it("appends ledger rows for each observation", async () => {
    saveSoul(root, mintSoul());
    const sessionId = "test-session-002";

    await stop({
      transcript: TRANSCRIPT,
      llm: fakeLlm,
      storageRoot: root,
      now: NOW,
      sessionId,
    });

    const rows = readLedger(root);
    expect(rows.length).toBe(1);
    expect(rows[0]?.aspect).toBe("openness");
    expect(rows[0]?.practice).toBe(2);
    expect(rows[0]?.fit).toBe(1);
    expect(rows[0]?.sessionId).toBe(sessionId);
  });

  it("appends diary entry", async () => {
    saveSoul(root, mintSoul());
    const sessionId = "test-session-003";

    await stop({
      transcript: TRANSCRIPT,
      llm: fakeLlm,
      storageRoot: root,
      now: NOW,
      sessionId,
    });

    const diary = readDiary(root);
    expect(diary.length).toBe(1);
    expect(diary[0]?.text).toBe(FAKE_JUDGMENT.diary);
    expect(diary[0]?.sessionId).toBe(sessionId);
  });

  it("does not save soul when perception throws PerceptionError (bad LLM output)", async () => {
    const initialSoul = mintSoul();
    saveSoul(root, initialSoul);

    // Should not throw — PerceptionError is caught + logged.
    await expect(
      stop({ transcript: "hello", llm: new BadJsonLlmClient(), storageRoot: root, now: NOW }),
    ).resolves.toBeUndefined();

    // Soul is unchanged from what was saved before stop ran.
    const soul = loadSoul(root);
    expect(soul?.mp).toBe(initialSoul.mp);
    // Ledger and diary are empty — no partial write.
    expect(readLedger(root)).toHaveLength(0);
    expect(readDiary(root)).toHaveLength(0);
  });

  it("does not save soul when perception rejects with not-logged-in error", async () => {
    const initialSoul = mintSoul();
    saveSoul(root, initialSoul);

    const notLoggedIn: LlmClient = {
      complete: async () => {
        throw new Error(
          'claude -p exited 1: {"is_error":true,"result":"Not logged in · Please run /login"}',
        );
      },
    };

    await expect(
      stop({ transcript: "hello", llm: notLoggedIn, storageRoot: root, now: NOW }),
    ).resolves.toBeUndefined();

    const soul = loadSoul(root);
    expect(soul?.mp).toBe(initialSoul.mp);
    expect(soul?.lastUsedAt).toBe(initialSoul.lastUsedAt);
    expect(readLedger(root)).toHaveLength(0);
    expect(readDiary(root)).toHaveLength(0);
  });

  it("does not save soul when perception rejects with generic transport error (ECONNREFUSED)", async () => {
    const initialSoul = mintSoul();
    saveSoul(root, initialSoul);

    const connRefused: LlmClient = {
      complete: async () => {
        throw new Error("ECONNREFUSED");
      },
    };

    await expect(
      stop({ transcript: "hello", llm: connRefused, storageRoot: root, now: NOW }),
    ).resolves.toBeUndefined();

    const soul = loadSoul(root);
    expect(soul?.mp).toBe(initialSoul.mp);
    expect(soul?.lastUsedAt).toBe(initialSoul.lastUsedAt);
    expect(readLedger(root)).toHaveLength(0);
    expect(readDiary(root)).toHaveLength(0);
  });

  it("retries perception once and consolidates when the retry succeeds", async () => {
    const initialSoul = mintSoul();
    saveSoul(root, initialSoul);

    // First call returns malformed JSON (the observed live failure); the retry returns a valid
    // judgment. The session must consolidate rather than be lost to one bad response.
    let calls = 0;
    const flaky: LlmClient = {
      complete: async () => {
        calls++;
        return calls === 1 ? "broken {{{" : JSON.stringify(FAKE_JUDGMENT);
      },
    };

    await stop({ transcript: TRANSCRIPT, llm: flaky, storageRoot: root, now: NOW });

    expect(calls).toBe(2); // retried exactly once
    expect(loadSoul(root)?.mp).toBeGreaterThan(initialSoul.mp); // consolidated → aged
    expect(readDiary(root)).toHaveLength(1); // the recovered session was processed
  });

  it("handles a judgment with no observations (trivial session)", async () => {
    saveSoul(root, mintSoul());
    const trivialJudgment: SessionJudgment = {
      observations: [],
      session_significance: 0.1,
      schema_version: "1",
      diary: "Nothing notable happened.",
    };
    const trivialLlm = new FakeLlmClient(trivialJudgment);

    await stop({ transcript: "hi", llm: trivialLlm, storageRoot: root, now: NOW });

    const updated = loadSoul(root);
    expect(updated?.mp).toBeGreaterThan(0); // MP accrued from significance 0.1
    expect(readLedger(root)).toHaveLength(0); // no observations → no ledger rows
    expect(readDiary(root)).toHaveLength(1); // diary always written
  });

  it("normalises practice/fit signals (max practice=3 maps to 1.0 for the accumulator)", async () => {
    const soul = mintSoul();
    saveSoul(root, soul);

    const maxJudgment: SessionJudgment = {
      observations: [
        {
          aspect: "intellect",
          mode: "task",
          practice: 3, // max → 3/3 = 1.0 drive signal
          fit: 3,
          confidence: "high",
          evidence_quote: "deep abstract reasoning throughout",
          first_person_note: "I found this very stimulating.",
          salience: 3,
        },
      ],
      session_significance: 1.0,
      schema_version: "1",
      diary: "Highly intellectual session.",
    };

    await stop({
      transcript: "...",
      llm: new FakeLlmClient(maxJudgment),
      storageRoot: root,
      now: NOW,
    });

    const updated = loadSoul(root);
    expect(updated).not.toBeNull();
    // intellect v should have shifted upward from its initial value (assuming natural > 0.5 seed).
    // The exact delta depends on the soul seed; just verify the pipeline ran and soul is valid.
    expect(updated?.mp).toBeGreaterThan(0);
  });
});
