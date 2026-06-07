/**
 * @saulene/plugin/mcp — tests
 *
 * Tests for the snapshot reader, MCP server tool handlers, and /ul skill formatter.
 * All IO uses temp dirs (never touches ~/.saulene). Timestamps are injected.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Soul, seedFromEntropy } from "@saulene/core";
import { appendLedger, saveSoul } from "@saulene/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/server.js";
import { snapshot } from "../src/mcp/snapshot.js";
import { ulText } from "../src/skill/index.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ENTROPY = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const NOW = 1_720_000_000_000;

const mintSoul = (): Soul => ({ ...seedFromEntropy(ENTROPY, NOW), lastUsedAt: NOW });

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-mcp-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ── snapshot() ─────────────────────────────────────────────────────────────────

describe("snapshot", () => {
  it("returns null when no soul exists", () => {
    expect(snapshot({ storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns a full snapshot when a soul exists", () => {
    saveSoul(root, mintSoul());
    const snap = snapshot({ storageRoot: root, now: NOW });
    expect(snap).not.toBeNull();
    expect(snap?.mbti).toMatch(/^[EI][NS][FT][JP]$/);
    expect(snap?.stage).toMatch(/childhood|adolescence|early_adulthood|old_adulthood/);
    expect(snap?.mp).toBeGreaterThanOrEqual(0);
  });

  it("scales aspects to 0-100 display range", () => {
    saveSoul(root, mintSoul());
    const snap = snapshot({ storageRoot: root, now: NOW });
    expect(snap).not.toBeNull();
    for (const val of Object.values(snap?.aspects)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(100);
    }
  });

  it("computes daysUntilDeath correctly", () => {
    saveSoul(root, mintSoul());
    // NOW is exactly at lastUsedAt → 90 days remaining.
    const snap = snapshot({ storageRoot: root, now: NOW });
    expect(snap?.daysUntilDeath).toBeCloseTo(90, 0);
    expect(snap?.isDead).toBe(false);
  });

  it("marks isDead when past the 90-day threshold", () => {
    const deadSoul: Soul = { ...mintSoul(), lastUsedAt: NOW - 91 * 24 * 60 * 60 * 1000 };
    saveSoul(root, deadSoul);
    const snap = snapshot({ storageRoot: root, now: NOW });
    expect(snap?.isDead).toBe(true);
    expect(snap?.daysUntilDeath).toBeLessThan(0);
  });

  it("returns recentDrift rows from ledger in newest-first order", () => {
    const soul = mintSoul();
    saveSoul(root, soul);
    appendLedger(root, {
      sessionId: "s1",
      timestamp: NOW - 2000,
      aspect: "openness",
      mode: "task",
      practice: 2,
      fit: 1,
      confidence: "med",
      evidenceQuote: "test",
      firstPersonNote: "note",
      salience: 1,
    });
    appendLedger(root, {
      sessionId: "s2",
      timestamp: NOW - 1000,
      aspect: "intellect",
      mode: "task",
      practice: 3,
      fit: 2,
      confidence: "high",
      evidenceQuote: "test2",
      firstPersonNote: "note2",
      salience: 2,
    });
    const snap = snapshot({ storageRoot: root, now: NOW, driftRows: 5 });
    expect(snap?.recentDrift).toHaveLength(2);
    // newest-first: intellect row (s2) should be first
    expect(snap?.recentDrift[0]?.aspect).toBe("intellect");
    expect(snap?.recentDrift[1]?.aspect).toBe("openness");
  });

  it("respects driftRows limit", () => {
    const soul = mintSoul();
    saveSoul(root, soul);
    for (let i = 0; i < 10; i++) {
      appendLedger(root, {
        sessionId: `s${i}`,
        timestamp: NOW + i,
        aspect: "openness",
        mode: "task",
        practice: 1,
        fit: 0,
        confidence: "low",
        evidenceQuote: "q",
        firstPersonNote: "n",
        salience: 1,
      });
    }
    const snap = snapshot({ storageRoot: root, now: NOW, driftRows: 3 });
    expect(snap?.recentDrift).toHaveLength(3);
  });
});

// ── createMcpServer() — factory smoke test ────────────────────────────────────

describe("createMcpServer", () => {
  it("returns a Server instance", () => {
    const server = createMcpServer({ storageRoot: root, now: NOW });
    // Full transport integration requires a real stdio pair; smoke-test the factory.
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
  });
});

// ── ulText() ─────────────────────────────────────────────────────────────────

describe("ulText", () => {
  it("returns null when no soul exists", () => {
    expect(ulText({ storageRoot: root, now: NOW })).toBeNull();
  });

  it("returns a markdown string when soul exists", () => {
    saveSoul(root, mintSoul());
    const text = ulText({ storageRoot: root, now: NOW });
    expect(text).not.toBeNull();
    expect(typeof text).toBe("string");
    expect(text?.length).toBeGreaterThan(0);
  });

  it("includes MBTI, stage, and aspects section", () => {
    saveSoul(root, mintSoul());
    const text = ulText({ storageRoot: root, now: NOW });
    expect(text).toContain("##");
    expect(text).toContain("mp");
    expect(text).toContain("Aspects");
    expect(text).toContain("Openness");
    expect(text).toContain("Industriousness");
  });

  it("shows death warning when approaching threshold", () => {
    const almostDead: Soul = { ...mintSoul(), lastUsedAt: NOW - 85 * 24 * 60 * 60 * 1000 };
    saveSoul(root, almostDead);
    const text = ulText({ storageRoot: root, now: NOW });
    // 5 days left → should show warning
    expect(text).toContain("d until neglect-death");
  });

  it("shows dead message when past threshold", () => {
    const dead: Soul = { ...mintSoul(), lastUsedAt: NOW - 91 * 24 * 60 * 60 * 1000 };
    saveSoul(root, dead);
    const text = ulText({ storageRoot: root, now: NOW });
    expect(text).toContain("Neglect-dead");
  });

  it("shows drift section when ledger rows exist", () => {
    saveSoul(root, mintSoul());
    appendLedger(root, {
      sessionId: "sx",
      timestamp: NOW - 100,
      aspect: "assertiveness",
      mode: "interaction",
      practice: 2,
      fit: -1,
      confidence: "med",
      evidenceQuote: "pushed back strongly",
      firstPersonNote: "I stood my ground.",
      salience: 2,
    });
    const text = ulText({ storageRoot: root, now: NOW });
    expect(text).toContain("Recent drift");
    expect(text).toContain("Assertiveness");
  });
});
