/**
 * @saulene/plugin — terminal birth animation
 *
 * The watch-only birth animation that plays on first install, adapted for the terminal.
 * Choreography (per SPEC): gather → condense (center → upper ring → lower ring) →
 * spark (color flush) → wake (eyes open) → first breath → idle loop.
 *
 * `birthFrames()` is pure — it returns the frame sequence; the caller supplies IO
 * (write + sleep). `playBirth()` wires those together for normal use.
 */

import type { SpriteParams } from "@saulene/renderer";
import {
  CHAR_ROWS,
  type OverlayFlags,
  type PixelGrid,
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
import {
  BASE,
  BODY,
  BODY_SUCCESS,
  EYES,
  H,
  TICK_MS,
  W,
  WISP_ORIGINAL,
  breatheDy,
} from "./sprite-data.js";

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
  /** Which body rows are visible (undefined = all; otherwise a Set of row indices). */
  visibleRows?: ReadonlySet<number>;
}

// ── Puff row sets (pixel row → body row index) ────────────────────────────────
// Body art: 6 rows (0–5). Center puff appears first, then upper ring, then lower ring.
const PUFF_PHASES: ReadonlyArray<readonly number[]> = [
  [2, 3], // center puff (body art rows 2+3 = the wide middle section)
  [1, 0], // upper ring (rows 1+0)
  [4, 5], // lower ring (rows 4+5)
] as const;

// ── Pure birth frame sequence ─────────────────────────────────────────────────

/**
 * Returns the full birth animation frame sequence. Pure: no IO, no randomness.
 * All frames reference the same WISP_ORIGINAL / BODY art; the rasterizer applies colors.
 */
export function birthFrames(): BirthFrame[] {
  const frames: BirthFrame[] = [];
  const noWisps: OverlayFlags = { noWisps: 1 };

  // Phase 1: blank (gathering) — 6 ticks before anything appears
  for (let i = 0; i < 6; i++) {
    frames.push({ delayMs: TICK_MS, wispCells: [], overlay: noWisps, dy: 0 });
  }

  // Phase 2: wisps drift in from the sides — 8 ticks
  // Simulate inward slide: start far out, step toward rest position
  for (let step = 4; step >= 0; step--) {
    const slide = step; // start with offset = 4, reduce to 0
    const cells: [number, number][] = WISP_ORIGINAL.map(([r, c]): [number, number] => {
      const offset = c < W / 2 ? -slide : slide;
      return [r, c + offset];
    }).filter(([, c]) => c >= 0 && c < W);
    frames.push({ delayMs: 100, wispCells: cells, overlay: {}, dy: 0 });
  }
  for (let i = 0; i < 3; i++) {
    frames.push({ delayMs: TICK_MS, wispCells: WISP_ORIGINAL, overlay: {}, dy: 0 });
  }

  // Phase 3: condense — cloud body grows puff-by-puff, center → upper ring → lower ring
  const visible = new Set<number>();
  for (const rowSet of PUFF_PHASES) {
    for (const r of rowSet) visible.add(r);
    const snap = new Set(visible);
    for (let i = 0; i < 4; i++) {
      frames.push({
        delayMs: 120,
        wispCells: WISP_ORIGINAL,
        overlay: {},
        dy: 0,
        visibleRows: snap,
      });
    }
  }

  // Phase 4: spark — body briefly flushes lighter (a warm flash), then settles
  for (let i = 0; i < 3; i++) {
    frames.push({ delayMs: 80, wispCells: WISP_ORIGINAL, overlay: { success: 1 }, dy: 0 });
  }
  for (let i = 0; i < 5; i++) {
    frames.push({ delayMs: TICK_MS, wispCells: WISP_ORIGINAL, overlay: {}, dy: 0 });
  }

  // Phase 5: wake — eyes appear (they're drawn once body is stable; no special flag needed)
  for (let i = 0; i < 6; i++) {
    frames.push({ delayMs: 90, wispCells: WISP_ORIGINAL, overlay: {}, dy: 0 });
  }

  // Phase 6: first breath — 34 ticks of breathing, then idle continues
  for (let i = 0; i < 34; i++) {
    frames.push({ delayMs: TICK_MS, wispCells: WISP_ORIGINAL, overlay: {}, dy: breatheDy(i) });
  }

  return frames;
}

// ── Terminal render helper for birth frames ────────────────────────────────────

/**
 * Render one birth frame to an ANSI terminal string. Handles `visibleRows` for
 * the puff-by-puff condensing effect — invisible rows are rendered as blank lines.
 */
export function renderBirthFrame(
  frame: BirthFrame,
  params: SpriteParams,
  mode: "dark" | "light" = "dark",
): string {
  const colors = colorsFromParams(params, mode);

  if (!frame.visibleRows) {
    // Normal compose
    const grid = compose(colors, frame.wispCells, frame.overlay, frame.dy);
    return pixelGridToAnsi(grid);
  }

  // Partial-body compose: only paint body rows in the visible set
  const { dx = 0, blink, eye = 0, eyeDy = 0, wdy = 0, win = 0, noWisps } = frame.overlay;

  type Pixel = RgbColor | null;
  const px: Pixel[][] = Array.from({ length: H }, () => Array<Pixel>(W).fill(null));

  // Paint visible body rows only
  for (let r = 0; r < BODY.length; r++) {
    if (!frame.visibleRows.has(r)) continue;
    const row = BODY[r];
    if (!row) continue;
    for (let c = 0; c < W; c++) {
      const ch = row[c];
      if (ch === "." || ch === undefined) continue;
      const rr = r + BASE;
      const cc = c + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        paint(px, rr, cc, ch === "e" || ch === "f" ? colors.fill : colors.ink);
      }
    }
  }

  // Paint eyes if visible (only once rows 2/3 appear)
  if (!blink && frame.visibleRows.has(2)) {
    for (const eyePos of EYES) {
      const er = eyePos[0];
      const ec = eyePos[1];
      const rr = er + BASE + eyeDy;
      const cc = ec + eye + dx;
      if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
        paint(px, rr, cc, colors.eye);
      }
    }
  }

  // Paint wisps
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

  return pixelGridToAnsi(px as PixelGrid);
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
