/**
 * @saulene/plugin — statusline truecolor half-block rasterizer
 *
 * Converts SpriteParams (from the pure renderer) + an animation overlay into
 * a terminal string using Unicode ▀ half-blocks and ANSI truecolor SGR codes.
 *
 * Two pixels per terminal row: top pixel → foreground color + ▀, bottom pixel →
 * background color. Each null cell renders as a single reset space (transparent).
 *
 * Color derivation from SpriteParams:
 *   - body fill  → HSL(params.hue, params.saturation%, params.lightness%)
 *   - ink/outline → fixed grey (#b8b8b8) in dark mode
 *   - wisps      → white (#ffffff) in dark mode
 *   - eye        → near-black (#161310)
 */

import type { SpriteParams } from "@saulene/renderer";
import { BASE, BODY, BODY_CTXHIGH, BODY_OPEN, BODY_SUCCESS, EYES, H, W } from "./sprite-data.js";

// ── Color types ───────────────────────────────────────────────────────────────

export type RgbColor = readonly [number, number, number]; // [r, g, b] each 0–255
export type PixelGrid = (RgbColor | null)[][]; // [row][col]

export interface RasterizerColors {
  fill: RgbColor;
  ink: RgbColor;
  wisp: RgbColor;
  eye: RgbColor;
}

// ── Animation overlay flags (same semantics as compose() in scripts/ul-idle.mjs) ──

export interface OverlayFlags {
  dx?: number; // body + wisp horizontal shift (px)
  blink?: 1; // hide eyes
  eye?: number; // eye horizontal shift (pixels, relative to dx)
  eyeDy?: number; // eye vertical shift (compaction scan drops eyes 1px)
  open?: 1 | 2; // context-filling body: 1=frame1 (nubs closer), 2=frame2 (wider)
  wdy?: number; // wisp-only vertical offset (prompt hop: wisps go down when body goes up)
  ctx?: 1; // context >80% body variant
  win?: number; // wisp slide: positive=inward (thinking), negative=outward (response puff)
  success?: 1; // success body variant
  noWisps?: 1; // suppress all wisps (error shake, retry)
}

// ── Color derivation ──────────────────────────────────────────────────────────
// EVERY ul renders the canonical DEFAULT look — sprite color is intentionally NOT
// individualized by traits (all uls look the same). `_params` is retained on the signature
// for API stability but no longer affects the rendered colors.

const DARK_FILL: RgbColor = [0xff, 0xff, 0xff]; // white body fill (dark terminal)
const DARK_INK: RgbColor = [0xb8, 0xb8, 0xb8]; // grey outline (dark terminal)
const DARK_WISP: RgbColor = [0xff, 0xff, 0xff]; // white wisps
const EYE_COLOR: RgbColor = [0x16, 0x13, 0x10]; // near-black eye
const LIGHT_CYAN: RgbColor = [0x99, 0xd9, 0xea]; // all-cyan (light terminal)

export function colorsFromParams(
  _params: SpriteParams,
  mode: "dark" | "light" = "dark",
): RasterizerColors {
  if (mode === "light") {
    return { fill: LIGHT_CYAN, ink: LIGHT_CYAN, wisp: LIGHT_CYAN, eye: EYE_COLOR };
  }
  return { fill: DARK_FILL, ink: DARK_INK, wisp: DARK_WISP, eye: EYE_COLOR };
}

// ── Pixel write helper ────────────────────────────────────────────────────────

// Safe pixel write — bounds are checked by the caller, but noUncheckedIndexedAccess
// means TypeScript can't prove px[rr] is non-null, so we guard here.
function paint(px: PixelGrid, rr: number, cc: number, color: RgbColor): void {
  const row = px[rr];
  if (row) row[cc] = color;
}

function readPx(px: PixelGrid, rr: number, cc: number): RgbColor | null {
  const row = px[rr];
  return row ? (row[cc] ?? null) : null;
}

// ── Core compositor ───────────────────────────────────────────────────────────

/**
 * Build a pixel grid for one animation frame. Pure — same inputs → same output.
 *
 * @param colors    Colors derived from SpriteParams (via colorsFromParams).
 * @param wispCells Active wisp pixel positions ([row, col] in pixel coords).
 * @param overlay   Animation overlay flags from the director.
 * @param dy        Body vertical offset (breathing, prompt hop).
 */
export function compose(
  colors: RasterizerColors,
  wispCells: readonly [number, number][],
  overlay: OverlayFlags,
  dy: number,
): PixelGrid {
  const dx = overlay.dx ?? 0;
  const blink = overlay.blink;
  const eye = overlay.eye ?? 0;
  const eyeDy = overlay.eyeDy ?? 0;
  const open = overlay.open;
  const wdy = overlay.wdy ?? 0;
  const ctx = overlay.ctx;
  const win = overlay.win ?? 0;
  const success = overlay.success;
  const noWisps = overlay.noWisps;

  const px: PixelGrid = Array.from({ length: H }, () => Array<RgbColor | null>(W).fill(null));

  // Select body art
  const body: readonly string[] = open
    ? (BODY_OPEN[open - 1] ?? BODY)
    : success
      ? BODY_SUCCESS
      : ctx
        ? BODY_CTXHIGH
        : BODY;

  // Paint body pixels
  for (let r = 0; r < body.length; r++) {
    const row = body[r];
    if (!row) continue;
    for (let c = 0; c < W; c++) {
      const ch = row[c];
      if (ch === "." || ch === undefined) continue;
      const rr = r + BASE + dy;
      const cc = c + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        // 'e' = eye socket: render as fill color (the eye pixel overwrites it below)
        paint(px, rr, cc, ch === "e" || ch === "f" ? colors.fill : colors.ink);
      }
    }
  }

  // Paint eye pixels (on top of body, unless blink or filling mode)
  if (!blink && !open) {
    for (const eyePos of EYES) {
      const er = eyePos[0];
      const ec = eyePos[1];
      const rr = er + BASE + dy + eyeDy;
      const cc = ec + eye + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        paint(px, rr, cc, colors.eye);
      }
    }
  }

  // Paint wisp pixels (absorbed when they slide into the body)
  if (!noWisps) {
    for (const wispPos of wispCells) {
      const wr = wispPos[0];
      const wc = wispPos[1];
      // win > 0 → inward (thinking); win < 0 → outward (response puff)
      const inward = wc < W / 2 ? win : -win;
      const rr = wr + BASE + wdy;
      const cc = wc + inward + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W && !readPx(px, rr, cc)) {
        paint(px, rr, cc, colors.wisp);
      }
    }
  }

  return px;
}

// ── ANSI half-block renderer ──────────────────────────────────────────────────

const RESET = "\x1b[0m";

function fgCode(c: RgbColor): string {
  return `\x1b[38;2;${c[0]};${c[1]};${c[2]}m`;
}

function bgCode(c: RgbColor): string {
  return `\x1b[48;2;${c[0]};${c[1]};${c[2]}m`;
}

/**
 * Convert a pixel grid to an ANSI truecolor terminal string.
 * Two pixel rows → one terminal row via ▀ (top = fg, bottom = bg).
 *
 * @param grid    PixelGrid from compose().
 * @param indent  Optional string prepended to each terminal row (default "").
 */
export function pixelGridToAnsi(grid: PixelGrid, indent = ""): string {
  let out = "";
  for (let r = 0; r < H; r += 2) {
    out += indent;
    for (let c = 0; c < W; c++) {
      const topRow = grid[r];
      const botRow = r + 1 < H ? grid[r + 1] : undefined;
      const top = topRow ? (topRow[c] ?? null) : null;
      const bot = botRow ? (botRow[c] ?? null) : null;
      if (!top && !bot) {
        out += `${RESET} `;
      } else if (top && bot) {
        out += `${fgCode(top)}${bgCode(bot)}▀${RESET}`;
      } else if (top) {
        out += `${fgCode(top)}▀${RESET}`;
      } else if (bot) {
        out += `${fgCode(bot)}▄${RESET}`;
      }
    }
    out += "\n";
  }
  return out;
}

/** Number of terminal rows the sprite occupies (H / 2 half-blocks). */
export const CHAR_ROWS = Math.ceil(H / 2);
