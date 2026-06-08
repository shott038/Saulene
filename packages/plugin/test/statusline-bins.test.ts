/**
 * @saulene/plugin — statusline bin + enable-step tests
 *
 * Covers the Claude Code statusLine wiring added in 0.1.5:
 *   - renderStatuslineFrame: deterministic single-frame render (pure)
 *   - mergeStatusLineSettings / buildLauncherScript: pure enable helpers
 *   - the shipped bundles (dist/bin/statusline.js, enable-statusline.js) end-to-end,
 *     against TEMP roots (never the real ~/.saulene or ~/.claude) — guarded so the
 *     suite stays green even before `pnpm bundle` has run.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { seedFromEntropy } from "@saulene/core";
import { saveSoul } from "@saulene/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLauncherScript, mergeStatusLineSettings } from "../src/statusline/enable.js";
import { renderStatuslineFrame } from "../src/statusline/frame.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, "..", "dist", "bin");
const STATUSLINE_BIN = join(DIST, "statusline.js");
const ENABLE_BIN = join(DIST, "enable-statusline.js");

const SOUL = seedFromEntropy(new Uint8Array(32).fill(7), 1_700_000_000_000);

// ── renderStatuslineFrame (pure) ────────────────────────────────────────────────

describe("renderStatuslineFrame", () => {
  it("renders a multi-line truecolor frame for a known soul", () => {
    const out = renderStatuslineFrame(SOUL, 0, "dark");
    expect(out).toContain("\x1b[38;2;"); // truecolor fg SGR
    expect(out.split("\n").length).toBeGreaterThan(2); // multi-line half-blocks
  });

  it("is deterministic: identical tick → identical output", () => {
    expect(renderStatuslineFrame(SOUL, 42, "dark")).toEqual(
      renderStatuslineFrame(SOUL, 42, "dark"),
    );
  });

  it("blinks (hides eyes) on the blink tick — output differs from a non-blink tick", () => {
    const blink = renderStatuslineFrame(SOUL, 0, "dark"); // 0 % 50 === 0 → blink
    const open = renderStatuslineFrame(SOUL, 1, "dark");
    expect(blink).not.toEqual(open);
  });

  it("light mode differs from dark mode", () => {
    expect(renderStatuslineFrame(SOUL, 5, "light")).not.toEqual(
      renderStatuslineFrame(SOUL, 5, "dark"),
    );
  });
});

// ── mergeStatusLineSettings (pure) ──────────────────────────────────────────────

describe("mergeStatusLineSettings", () => {
  it("adds a statusLine command block", () => {
    const out = mergeStatusLineSettings({}, "sh /x/launch.sh", 10);
    expect(out.statusLine).toEqual({
      type: "command",
      command: "sh /x/launch.sh",
      refreshInterval: 10,
    });
  });

  it("preserves all other keys", () => {
    const out = mergeStatusLineSettings({ model: "opus", permissions: { allow: ["Bash"] } }, "cmd");
    expect(out.model).toBe("opus");
    expect(out.permissions).toEqual({ allow: ["Bash"] });
  });

  it("is idempotent: merging twice yields the same result, no dup", () => {
    const once = mergeStatusLineSettings({ model: "opus" }, "cmd", 10);
    const twice = mergeStatusLineSettings(once, "cmd", 10);
    expect(twice).toEqual(once);
  });

  it("omits refreshInterval when not provided", () => {
    const out = mergeStatusLineSettings({}, "cmd");
    expect(out.statusLine).toEqual({ type: "command", command: "cmd" });
  });
});

// ── buildLauncherScript (pure) ──────────────────────────────────────────────────

describe("buildLauncherScript", () => {
  it("resolves the newest install and falls back to the captured path", () => {
    const sh = buildLauncherScript("/cache/saulene/saulene", "/cache/saulene/saulene/0.1.5/x.js");
    expect(sh).toContain("BASE='/cache/saulene/saulene'");
    expect(sh).toContain("FALLBACK='/cache/saulene/saulene/0.1.5/x.js'");
    expect(sh).toContain("sort -V"); // newest-version selection
    expect(sh).toContain('exec node "$TARGET"');
  });

  it("single-quote-escapes paths safely", () => {
    const sh = buildLauncherScript("/a'b", "/c");
    expect(sh).toContain("BASE='/a'\\''b'");
  });
});

// ── Shipped bundles end-to-end (guarded on build) ───────────────────────────────

describe.skipIf(!existsSync(STATUSLINE_BIN))("dist/bin/statusline.js", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "saulene-sl-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("no soul → blank output, exit 0", () => {
    const out = execFileSync("node", [STATUSLINE_BIN], {
      input: "{}",
      env: { ...process.env, SAULENE_ROOT: root },
      encoding: "utf8",
    });
    expect(out).toBe("");
  });

  it("with a soul → prints a frame, exit 0", () => {
    saveSoul(root, SOUL);
    const out = execFileSync("node", [STATUSLINE_BIN], {
      input: "{}",
      env: { ...process.env, SAULENE_ROOT: root },
      encoding: "utf8",
    });
    expect(out).toContain("\x1b[38;2;");
  });
});

describe.skipIf(!existsSync(ENABLE_BIN))("dist/bin/enable-statusline.js", () => {
  let root: string;
  let settingsPath: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "saulene-en-"));
    settingsPath = join(root, "settings.json");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function run(): void {
    execFileSync("node", [ENABLE_BIN], {
      env: { ...process.env, SAULENE_ROOT: root, CLAUDE_SETTINGS_PATH: settingsPath },
      encoding: "utf8",
    });
  }

  it("creates settings.json with a statusLine block when absent", () => {
    run();
    const s = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(s.statusLine.type).toBe("command");
    expect(s.statusLine.command).toContain("statusline-launch.sh");
  });

  it("preserves existing keys and is idempotent", () => {
    writeFileSync(settingsPath, JSON.stringify({ model: "opus" }), "utf8");
    run();
    const first = readFileSync(settingsPath, "utf8");
    run();
    const second = readFileSync(settingsPath, "utf8");
    expect(second).toBe(first); // idempotent
    expect(JSON.parse(second).model).toBe("opus"); // preserved
  });

  it("refuses to clobber an unparseable settings.json", () => {
    writeFileSync(settingsPath, "{ not json", "utf8");
    expect(() => run()).toThrow(); // non-zero exit
    expect(readFileSync(settingsPath, "utf8")).toBe("{ not json"); // left untouched
  });
});
