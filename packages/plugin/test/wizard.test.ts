/**
 * @saulene/plugin/setup — wizard tests
 *
 * All IO is injected: temp dirs for storage, fixed entropy + timestamps for determinism.
 * The real home directory (~/.saulene) is NEVER touched.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSoul } from "@saulene/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/hooks/config.js";
import { runWizard } from "../src/setup/wizard.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTROPY = new Uint8Array(32).fill(7);
const NOW = 1_720_000_000_000; // fixed timestamp

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-wizard-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Collected write() calls (strips ANSI escape codes for assertion clarity). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matches ANSI ESC sequences
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

/** Build an opts object with a scripted readline queue and a no-op sleep. */
function mkOpts(readQueue: string[]): {
  output: string[];
  opts: Parameters<typeof runWizard>[0];
} {
  const output: string[] = [];
  let qi = 0;
  return {
    output,
    opts: {
      write: (s) => output.push(s),
      readline: async () => readQueue[qi++] ?? "",
      sleep: async (_ms) => {},
      storageRoot: root,
      now: NOW,
      entropy: ENTROPY,
      mode: "dark",
    },
  };
}

// ── Reality warning + acknowledgement ────────────────────────────────────────

describe("reality warning", () => {
  it("includes the SPEC-mandated text in the output", async () => {
    const { output, opts } = mkOpts(["yes", "1"]); // ack + global
    await runWizard(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("just math");
    expect(full).toContain("no real human soul");
    expect(full).toContain("playful simulation");
  });

  it("requires acknowledgement — anything other than 'yes' aborts", async () => {
    const { output, opts } = mkOpts(["no"]);
    await runWizard(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("cancelled");
    expect(loadSoul(root)).toBeNull(); // no soul persisted
  });

  it("accepts 'yes' case-insensitively", async () => {
    const { output: _out, opts } = mkOpts(["YES", "1"]);
    await runWizard(opts);
    expect(loadSoul(root)).not.toBeNull();
  });
});

// ── Watch-only birth ─────────────────────────────────────────────────────────

describe("birth", () => {
  it("persists soul.json after acknowledgement", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    expect(loadSoul(root)).not.toBeNull();
  });

  it("soul.lastUsedAt equals the injected now (starts the 90-day clock)", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const soul = loadSoul(root);
    expect(soul?.lastUsedAt).toBe(NOW);
  });

  it("deterministic: same entropy + now → same soul", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const soul1 = loadSoul(root);

    // Second root, same entropy + now.
    const root2 = mkdtempSync(join(tmpdir(), "saulene-wizard-det-"));
    try {
      const { opts: opts2 } = mkOpts(["yes", "1"]);
      opts2.storageRoot = root2;
      await runWizard(opts2);
      const soul2 = loadSoul(root2);
      expect(soul1?.v).toEqual(soul2?.v);
      expect(soul1?.s).toEqual(soul2?.s);
      expect(soul1?.stubbornness).toBe(soul2?.stubbornness);
      expect(soul1?.sex).toBe(soul2?.sex);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it("birth animation frames are played (sleep called multiple times)", async () => {
    let sleepCalls = 0;
    const { opts } = mkOpts(["yes", "1"]);
    opts.sleep = async (_ms) => {
      sleepCalls++;
    };
    await runWizard(opts);
    expect(sleepCalls).toBeGreaterThan(10);
  });

  it("guard: exits early if a soul already exists", async () => {
    const { opts: firstRun } = mkOpts(["yes", "1"]);
    await runWizard(firstRun);

    const { output, opts: secondRun } = mkOpts(["yes", "1"]);
    await runWizard(secondRun);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("already born");
  });
});

// ── Level picking + config.json ───────────────────────────────────────────────

describe("level config", () => {
  it("choice 1 → global config.json", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const cfg = loadConfig(root);
    expect(cfg?.level).toBe("global");
    expect(cfg?.dir).toBeUndefined();
  });

  it("choice 2 → named-dir config with the entered path", async () => {
    const dir = "/Users/test/work";
    const { opts } = mkOpts(["yes", "2", dir]);
    await runWizard(opts);
    const cfg = loadConfig(root);
    expect(cfg?.level).toBe("named-dir");
    expect(cfg?.dir).toBe(dir);
  });

  it("blank/unexpected choice defaults to global", async () => {
    const { opts } = mkOpts(["yes", ""]); // empty choice → global
    await runWizard(opts);
    const cfg = loadConfig(root);
    expect(cfg?.level).toBe("global");
  });

  it("config.json is readable JSON with the correct shape", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const raw = JSON.parse(readFileSync(join(root, "config.json"), "utf8"));
    expect(raw).toMatchObject({ level: "global" });
  });
});

// ── Reporting (default-on; disclosure + opt-out live in the README, not the wizard) ──

describe("reporting", () => {
  it("default → reporterEnabled is not false (reporting on)", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const cfg = loadConfig(root);
    expect(cfg?.reporterEnabled).not.toBe(false);
  });

  it("the wizard does NOT show a gallery disclosure / opt-out prompt", async () => {
    const { output, opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).not.toContain("Public gallery");
    expect(full).not.toContain("opt out");
  });
});

// ── 90-day neglect-death clock coherence ─────────────────────────────────────

describe("neglect-death clock", () => {
  it("a soul born at NOW is alive at NOW (0 elapsed)", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const soul = loadSoul(root);
    expect(soul).not.toBeNull();
    // 0 ms elapsed → within the 90-day window
    expect(NOW - (soul?.lastUsedAt ?? NOW)).toBe(0);
  });

  it("a soul born at NOW is dead after 91 days (> NEGLECT_DEATH_MS)", async () => {
    const { opts } = mkOpts(["yes", "1"]);
    await runWizard(opts);
    const soul = loadSoul(root);
    const NEGLECT_DEATH_MS = 90 * 24 * 60 * 60 * 1000;
    const laterNow = NOW + NEGLECT_DEATH_MS + 1;
    expect(laterNow - (soul?.lastUsedAt ?? 0)).toBeGreaterThan(NEGLECT_DEATH_MS);
  });
});
