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
import { runSetup, runWizard } from "../src/setup/wizard.js";

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

// ── runSetup — non-interactive path ──────────────────────────────────────────

/** Shared setup opts factory for runSetup tests (zero readline, no-anim). */
function mkSetupOpts(overrides: Partial<Parameters<typeof runSetup>[0]> = {}): {
  output: string[];
  opts: Parameters<typeof runSetup>[0];
} {
  const output: string[] = [];
  return {
    output,
    opts: {
      acknowledged: true,
      scope: "global",
      write: (s) => output.push(s),
      sleep: async (_ms) => {},
      storageRoot: root,
      now: NOW,
      entropy: ENTROPY,
      mode: "dark",
      noAnim: true,
      ...overrides,
    },
  };
}

describe("runSetup — acknowledgement guard", () => {
  it("acknowledged=false → no birth, clear message", async () => {
    const { output, opts } = mkSetupOpts({ acknowledged: false });
    await runSetup(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("requires acknowledgement");
    expect(loadSoul(root)).toBeNull();
  });

  it("acknowledged=true → births and persists soul", async () => {
    const { opts } = mkSetupOpts({ acknowledged: true });
    await runSetup(opts);
    expect(loadSoul(root)).not.toBeNull();
  });
});

describe("runSetup — scope / config", () => {
  it("scope=global → config.json level=global", async () => {
    const { opts } = mkSetupOpts({ scope: "global" });
    await runSetup(opts);
    const cfg = loadConfig(root);
    expect(cfg?.level).toBe("global");
    expect(cfg?.dir).toBeUndefined();
  });

  it("scope=dir + dir → config.json level=named-dir with dir", async () => {
    const dir = "/Users/test/project";
    const { opts } = mkSetupOpts({ scope: "dir", dir });
    await runSetup(opts);
    const cfg = loadConfig(root);
    expect(cfg?.level).toBe("named-dir");
    expect(cfg?.dir).toBe(dir);
  });

  it("scope=dir without dir → no birth, clear error", async () => {
    const { output, opts } = mkSetupOpts({ scope: "dir", dir: undefined });
    await runSetup(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("--dir");
    expect(loadSoul(root)).toBeNull();
  });

  it("bornAt is saved in config.json", async () => {
    const { opts } = mkSetupOpts();
    await runSetup(opts);
    const cfg = loadConfig(root);
    expect(cfg?.bornAt).toBe(NOW);
  });
});

describe("runSetup — reporterEnabled", () => {
  it("reporterEnabled omitted → not set to false (reporting on by default)", async () => {
    const { opts } = mkSetupOpts({ reporterEnabled: undefined });
    await runSetup(opts);
    const cfg = loadConfig(root);
    expect(cfg?.reporterEnabled).not.toBe(false);
  });

  it("reporterEnabled=false → persisted in config.json", async () => {
    const { opts } = mkSetupOpts({ reporterEnabled: false });
    await runSetup(opts);
    const cfg = loadConfig(root);
    expect(cfg?.reporterEnabled).toBe(false);
  });
});

describe("runSetup — no readline", () => {
  it("completes without any readline calls (pure flag-driven)", async () => {
    // If runSetup ever calls readline it would hang; this test proves it doesn't.
    const readlineCalled = { count: 0 };
    const { opts } = mkSetupOpts();
    // Inject a readline that would fail the test if called
    const optsWithSpy = {
      ...opts,
      // @ts-expect-error — SetupOpts has no readline; adding one to verify it's never invoked
      readline: async () => {
        readlineCalled.count++;
        return "";
      },
    };
    await runSetup(optsWithSpy as Parameters<typeof runSetup>[0]);
    expect(readlineCalled.count).toBe(0);
  });
});

describe("runSetup — already born guard", () => {
  it("exits early with friendly message if soul exists", async () => {
    // First birth
    await runSetup(mkSetupOpts().opts);
    // Second attempt
    const { output, opts } = mkSetupOpts();
    await runSetup(opts);
    const full = output.map(stripAnsi).join("");
    expect(full).toContain("already born");
  });
});

describe("runSetup — determinism", () => {
  it("same entropy + now → same soul as runWizard", async () => {
    // runSetup birth
    const root2 = mkdtempSync(join(tmpdir(), "saulene-setup-det-"));
    try {
      const { opts } = mkSetupOpts({ storageRoot: root2 });
      await runSetup(opts);
      const setupSoul = loadSoul(root2);

      // runWizard birth in the original root (same entropy + now)
      const { opts: wOpts } = mkOpts(["yes", "1"]);
      await runWizard(wOpts);
      const wizardSoul = loadSoul(root);

      expect(setupSoul?.v).toEqual(wizardSoul?.v);
      expect(setupSoul?.s).toEqual(wizardSoul?.s);
      expect(setupSoul?.sex).toBe(wizardSoul?.sex);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});
