/**
 * @saulene/renderer — sprite geometry (the locked ul cloud-spirit)
 *
 * The canonical geometry ported from `scripts/ul-geometry.mjs` (design truth; see
 * `docs/ul-default.svg`). All downstream rendering — SVG, the terminal rasterizer,
 * the animation director — reads from here so geometry never drifts.
 *
 * Puff ordering: index 0 is the central puff (the "seed"); 1–5 the upper ring;
 * 6–8 the lower ring. Birth grows them center → upper ring → lower ring.
 */

/** Bump on ANY change to rendered sprite output. Golden-file guard. */
export const SPRITE_VERSION = "1.0.0";

// ── cloud center (pivot for rotation/breathing/blink) ──────────────────────────
export const CX = 150;
export const CY = 108;

// ── wisp strokes: [x1, x2, y, dir] where dir = −1 (left) | +1 (right) ─────────
export const WISPS = [
  [66, 80, 100, -1],
  [46, 64, 112, -1],
  [62, 76, 124, -1], // left
  [220, 234, 100, 1],
  [236, 254, 112, 1],
  [224, 238, 124, 1], // right
] as const;

// ── ink (outline) circles: [cx, cy, r] ──────────────────────────────────────────
export const INK = [
  [150, 100, 31],
  [110, 102, 20],
  [126, 86, 24],
  [150, 74, 30],
  [174, 86, 24],
  [190, 102, 20],
  [126, 116, 24],
  [150, 128, 30],
  [174, 116, 24],
] as const;

// ── body (fill) circles: [cx, cy, r] ────────────────────────────────────────────
export const BODY = [
  [150, 100, 26],
  [110, 102, 15],
  [126, 86, 19],
  [150, 74, 25],
  [174, 86, 19],
  [190, 102, 15],
  [126, 116, 19],
  [150, 128, 25],
  [174, 116, 19],
] as const;

// ── eye centers: [cx, cy] ────────────────────────────────────────────────────────
export const EYES = [
  [143, 108],
  [157, 108],
] as const;

// ── puff-index sets used for crown/base shape modulation ────────────────────────
export const TOP_PUFF_INDICES = new Set([2, 3, 4]); // upper-ring puffs
export const BOT_PUFF_INDICES = new Set([6, 7, 8]); // lower-ring puffs

// ── colors ───────────────────────────────────────────────────────────────────────
export const INK_COLOR = "#161310"; // body outline + eyes
export const PAPER = "#ffffff"; // body fill

// ── hue ramp: warm terracotta → violet ember (sensing S → intuitive N unicorn) ──
// Indexed continuously by t ∈ [0,1] where t = blend(openness, intellect).
// Never crosses green/cyan so the cloud never reads as terminal noise.
export const HUE_RAMP = [34, 22, 10, 352, 326, 290] as const;
