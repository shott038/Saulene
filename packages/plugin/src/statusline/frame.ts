/**
 * @saulene/plugin — single-frame statusline render (Claude Code statusLine path)
 *
 * The runtime `StatusLine` class is an animation LOOP (cursor-redraw at 80ms). That's
 * wrong for Claude Code's `statusLine` contract, where each invocation REPLACES the
 * display and the command is re-run on events (assistant message, permission, /compact)
 * or a modest `refreshInterval` timer — no in-place animation.
 *
 * This module renders ONE current sprite frame, deterministically, from an injected
 * tick. Pure (no IO, no timers) so it's testable and crash-free; the bin owns the only
 * IO (loadSoul + stdout). A time-derived tick (Date.now in the bin) lets the frame
 * subtly change across the event-driven refreshes — a calm breath/blink, not a loop.
 */

import type { Soul } from "@saulene/core";
import { type SpriteParams, spriteParams } from "@saulene/renderer";
import { type OverlayFlags, colorsFromParams, compose, pixelGridToAnsi } from "./rasterizer.js";
import { WISP_EXTRA, WISP_ORIGINAL, breatheDy } from "./sprite-data.js";

/** Blink once every BLINK_PERIOD ticks (deterministic — no randomness). */
const BLINK_PERIOD = 50;

/** Base resting wisps for a soul (original variant; +extra when enthusiasm is high). */
function restingWisps(params: SpriteParams): readonly [number, number][] {
  const cells: [number, number][] = [...WISP_ORIGINAL];
  if (params.wispCount === 6) cells.push(...WISP_EXTRA);
  return cells;
}

/**
 * Render a single resting sprite frame as a multi-line truecolor half-block string.
 * Pure: same (soul, tick, mode, indent) → same output. Never throws.
 *
 * @param soul    The live soul (determines wisp count). Colors are canonical.
 * @param tick    A monotonic tick (e.g. Math.floor(Date.now()/TICK_MS)); drives the
 *                breathing float + the periodic blink. Identical ticks render identically.
 * @param mode    Terminal color mode ("dark" default, "light").
 * @param indent  Optional string prepended to each terminal row (status-bar prefix).
 */
export function renderStatuslineFrame(
  soul: Soul,
  tick: number,
  mode: "dark" | "light" = "dark",
  indent = "",
): string {
  const params = spriteParams(soul);
  const colors = colorsFromParams(params, mode);
  const overlay: OverlayFlags = {};
  if (tick % BLINK_PERIOD === 0) overlay.blink = 1;
  const dy = breatheDy(tick);
  const grid = compose(colors, restingWisps(params), overlay, dy);
  return pixelGridToAnsi(grid, indent);
}
