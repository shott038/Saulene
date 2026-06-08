/**
 * @saulene/plugin — terminal birth animation
 *
 * The watch-only birth animation that plays on first install, adapted for the terminal.
 * Choreography: wisps drift in (body hidden) → the body's CENTER appears → it slowly expands
 * outward, revealing the rest of the pixels until it reaches full size → settle → done.
 *
 * `birthFrames()` is pure — it returns the frame sequence; the caller supplies IO
 * (write + sleep). `playBirth()` wires those together for normal use.
 */

import type { SpriteParams } from "@saulene/renderer";
import {
  CHAR_ROWS,
  type OverlayFlags,
  type PixelGrid,
  type RasterizerColors,
  type RgbColor,
  colorsFromParams,
  compose,
  pixelGridToAnsi,
} from "./rasterizer.js";

// Safe write to pixel grid (see rasterizer.ts — noUncheckedIndexedAccess guard)
function paint(px: PixelGrid, rr: number, cc: number, color: RgbColor): void {
  const row = px[rr];
  if (row) row[cc] = color;
}
function readPx(px: PixelGrid, rr: number, cc: number): RgbColor | null {
  const row = px[rr];
  return row ? (row[cc] ?? null) : null;
}
import { BASE, BODY, EYES, H, TICK_MS, W, WISP_ORIGINAL } from "./sprite-data.js";

// ── Birth frame type ──────────────────────────────────────────────────────────

export interface BirthFrame {
  /** Delay after this frame in milliseconds. */
  delayMs: number;
  /** Active wisp cells (pixel coords). */
  wispCells: readonly [number, number][];
  /** Animation overlay. */
  overlay: OverlayFlags;
  /** Body vertical offset. */
  dy: number;
  /**
   * Center-out reveal radius. `undefined` = whole body (normal compose). `0` = body fully hidden
   * (wisps only). A growing radius blooms the body from its center outward to full size.
   */
  visibleRadius?: number;
}

// ── Center-out reveal geometry ────────────────────────────────────────────────
// The body art is 6 rows × W cols; its visual center sits between the eye rows. A pixel is
// revealed once its distance from that center is within the frame's radius. Rows are weighted
// up slightly (the half-block render makes a row visually denser than a column).
const CENTER_COL = 9.5;
const CENTER_ROW = 2.5;
const ROW_WEIGHT = 1.35;

/** Distance of a body-art pixel from the cloud's center (used for the bloom reveal). */
function radiusOf(row: number, col: number): number {
  return Math.hypot((row - CENTER_ROW) * ROW_WEIGHT, col - CENTER_COL);
}

// ── Pure birth frame sequence ─────────────────────────────────────────────────

/**
 * Returns the birth animation frame sequence. Pure: no IO, no randomness.
 *
 * Choreography: wisps drift in (body hidden) → the body's CENTER appears → it slowly expands
 * outward, revealing the rest of the pixels until it reaches full size → settle → done.
 */
export function birthFrames(): BirthFrame[] {
  const frames: BirthFrame[] = [];

  // Phase 1: gather — body hidden (radius 0), no wisps yet. A short beat.
  for (let i = 0; i < 3; i++) {
    frames.push({
      delayMs: TICK_MS,
      wispCells: [],
      overlay: { noWisps: 1 },
      dy: 0,
      visibleRadius: 0,
    });
  }

  // Phase 2: wisps drift in from the sides, body still hidden (radius 0).
  for (let step = 4; step >= 0; step--) {
    const slide = step; // start with offset = 4, reduce to 0
    const cells: [number, number][] = WISP_ORIGINAL.map(([r, c]): [number, number] => {
      const offset = c < W / 2 ? -slide : slide;
      return [r, c + offset];
    }).filter(([, c]) => c >= 0 && c < W);
    frames.push({ delayMs: 100, wispCells: cells, overlay: {}, dy: 0, visibleRadius: 0 });
  }
  for (let i = 0; i < 2; i++) {
    frames.push({
      delayMs: TICK_MS,
      wispCells: WISP_ORIGINAL,
      overlay: {},
      dy: 0,
      visibleRadius: 0,
    });
  }

  // Phase 3: the center appears (a small core), holds a beat...
  for (let i = 0; i < 3; i++) {
    frames.push({ delayMs: 110, wispCells: WISP_ORIGINAL, overlay: {}, dy: 0, visibleRadius: 0.9 });
  }
  // ...then slowly expands outward, revealing the rest of the pixels to full size.
  // Max pixel radius is ~3.6; 4.2 guarantees the whole body is shown.
  const RADII = [1.4, 1.8, 2.2, 2.6, 3.0, 3.4, 3.8, 4.2];
  for (const radius of RADII) {
    for (let i = 0; i < 2; i++) {
      frames.push({
        delayMs: 110,
        wispCells: WISP_ORIGINAL,
        overlay: {},
        dy: 0,
        visibleRadius: radius,
      });
    }
  }

  // Phase 4: full size — settle, then done. (No spark, no breathing tail; idle takes over later.)
  for (let i = 0; i < 5; i++) {
    frames.push({ delayMs: TICK_MS, wispCells: WISP_ORIGINAL, overlay: {}, dy: 0 });
  }

  return frames;
}

// ── Terminal render helper for birth frames ────────────────────────────────────

/**
 * Build the pixel grid for one birth frame (pure — no ANSI). Honors `visibleRadius` for the
 * center-out bloom (body/eye pixels appear once within the radius); `undefined` renders the whole
 * body. Takes resolved colors so it can render any palette (the live wizard passes the soul's
 * colors; the GIF exporter passes the canonical default palette).
 */
export function birthFrameGrid(frame: BirthFrame, colors: RasterizerColors): PixelGrid {
  if (frame.visibleRadius === undefined) {
    // Whole body visible — normal compose.
    return compose(colors, frame.wispCells, frame.overlay, frame.dy);
  }

  const radius = frame.visibleRadius;
  const { dx = 0, blink, eye = 0, eyeDy = 0, wdy = 0, win = 0, noWisps } = frame.overlay;

  type Pixel = RgbColor | null;
  const px: Pixel[][] = Array.from({ length: H }, () => Array<Pixel>(W).fill(null));

  // Paint body pixels within the reveal radius (center-out bloom).
  for (let r = 0; r < BODY.length; r++) {
    const row = BODY[r];
    if (!row) continue;
    for (let c = 0; c < W; c++) {
      const ch = row[c];
      if (ch === "." || ch === undefined) continue;
      if (radiusOf(r, c) > radius) continue;
      const rr = r + BASE;
      const cc = c + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        paint(px, rr, cc, ch === "e" || ch === "f" ? colors.fill : colors.ink);
      }
    }
  }

  // Paint eyes once the bloom reaches them.
  if (!blink) {
    for (const eyePos of EYES) {
      const er = eyePos[0];
      const ec = eyePos[1];
      if (radiusOf(er, ec) > radius) continue;
      const rr = er + BASE + eyeDy;
      const cc = ec + eye + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        paint(px, rr, cc, colors.eye);
      }
    }
  }

  // Paint wisps (they drift/stay independent of the body bloom).
  if (!noWisps) {
    for (const wispPos of frame.wispCells) {
      const wr = wispPos[0];
      const wc = wispPos[1];
      const inward = wc < W / 2 ? win : -win;
      const rr = wr + BASE + wdy;
      const cc = wc + inward + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W && !readPx(px, rr, cc)) {
        paint(px, rr, cc, colors.wisp);
      }
    }
  }

  return px as PixelGrid;
}

/**
 * Render one birth frame to an ANSI terminal string (the live wizard path). Honors the
 * center-out bloom via `visibleRadius` — pixels outside the radius are simply not drawn.
 */
export function renderBirthFrame(
  frame: BirthFrame,
  params: SpriteParams,
  mode: "dark" | "light" = "dark",
): string {
  return pixelGridToAnsi(birthFrameGrid(frame, colorsFromParams(params, mode)));
}

// ── Live birth animation ───────────────────────────────────────────────────────

/**
 * Play the birth animation in the terminal.
 *
 * @param params  SpriteParams for the newly born ul (determines colors).
 * @param write   Write ANSI string to the terminal.
 * @param sleep   Async sleep function (ms).
 * @param mode    Terminal color mode (default: "dark").
 */
export async function playBirth(
  params: SpriteParams,
  write: (s: string) => void,
  sleep: (ms: number) => Promise<void>,
  mode: "dark" | "light" = "dark",
): Promise<void> {
  const frames = birthFrames();
  let first = true;
  const up = `\x1b[${CHAR_ROWS}A`;

  for (const frame of frames) {
    const ansi = renderBirthFrame(frame, params, mode);
    if (!first) write(up);
    first = false;
    write(ansi);
    await sleep(frame.delayMs);
  }
}

/**
 * Static (non-redrawing) birth for captured/non-TTY output.
 *
 * Prints three keyframes sequentially without cursor-up escapes so the birth
 * moment still shows in captured stdout (e.g. the Claude Code `!` runner).
 * Each frame is printed as a new block — no in-place overwrite.
 */
export async function playBirthStatic(
  params: SpriteParams,
  write: (s: string) => void,
  sleep: (ms: number) => Promise<void>,
  mode: "dark" | "light" = "dark",
): Promise<void> {
  const frames = birthFrames();
  // Three keyframes: wisps-only (gathering), half-bloom, full body.
  // Indices derived from birthFrames() phase boundaries — see birth.ts comments.
  const KEYFRAME_INDICES = [8, 19, 29] as const;
  for (const idx of KEYFRAME_INDICES) {
    const frame = frames[idx];
    if (!frame) continue;
    write(renderBirthFrame(frame, params, mode));
    write("\n");
    await sleep(300);
  }
}
