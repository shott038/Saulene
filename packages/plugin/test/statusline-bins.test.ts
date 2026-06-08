/**
 * @saulene/plugin — statusline + enable-step tests (PURE helpers only)
 *
 * Covers the Claude Code statusLine wiring added in 0.1.5 by unit-testing the pure
 * source helpers — NOT by executing the shipped dist/bin bundles. Executing dist/bin
 * inside `pnpm check` is a landmine: `tsc -b` (the typecheck step) used to emit thin,
 * non-inlined output over the committed esbuild bundles, so a test that spawned them
 * crashed with ERR_MODULE_NOT_FOUND. The bins are thin IO glue over these helpers;
 * test the logic, not the artifact.
 *
 *   - renderStatuslineFrame: deterministic single-frame render (pure)
 *   - mergeStatusLineSettings / buildLauncherScript: pure enable helpers
 */

import { seedFromEntropy } from "@saulene/core";
import { describe, expect, it } from "vitest";
import { buildLauncherScript, mergeStatusLineSettings } from "../src/statusline/enable.js";
import { renderStatuslineFrame } from "../src/statusline/frame.js";

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
