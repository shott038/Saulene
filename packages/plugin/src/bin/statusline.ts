/**
 * @saulene/plugin — Claude Code statusLine renderer (single-shot)
 *
 * Wired into the user's `~/.claude/settings.json` `statusLine.command` (via the
 * launcher written by enable-statusline). Claude Code re-runs this on session events
 * and an optional refreshInterval; each run REPLACES the status display.
 *
 * Contract: read+ignore the session JSON on stdin, render ONE current sprite frame to
 * stdout, exit 0. No soul → print nothing (blank). MUST NEVER throw or block: any error
 * → blank + exit 0, so a broken ul never breaks the user's status bar.
 *
 * Tick is Date.now-derived so the frame subtly breathes/blinks across refreshes without
 * any animation loop. TERM color mode follows COLORFGBG when present (light terminals).
 */

import { defaultRoot, loadSoul } from "@saulene/storage";
import { renderStatuslineFrame } from "../statusline/frame.js";
import { TICK_MS } from "../statusline/sprite-data.js";

try {
  // Storage root: env override (used by live-verification against a temp root) → default.
  const root = process.env.SAULENE_ROOT || defaultRoot();
  const soul = loadSoul(root);
  if (soul) {
    // COLORFGBG "fg;bg" with a light background (bg 7/15) → light mode.
    const bg = (process.env.COLORFGBG ?? "").split(";").pop();
    const mode = bg === "7" || bg === "15" ? "light" : "dark";
    const tick = Math.floor(Date.now() / TICK_MS);
    process.stdout.write(renderStatuslineFrame(soul, tick, mode));
  }
  // No soul → print nothing (blank status line).
} catch {
  // Never surface an error into the status bar.
}
process.exit(0);
