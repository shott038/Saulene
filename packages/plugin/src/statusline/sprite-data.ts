/**
 * @saulene/plugin — statusline sprite data (the locked pixel art)
 *
 * Ported from scripts/ul-idle.mjs — the canonical pixel art bodies and wisp variants
 * proven in the viz-exploration prototype. Pure data; no IO.
 *
 * Grid: W=19 columns × H=8 pixel rows → 4 terminal rows via ▀ half-blocks.
 * BASE=1: resting row offset, preserving 1px of headroom above for the prompt hop.
 */

export const W = 19;
export const H = 8;
export const BASE = 1;
export const TICK_MS = 80; // animation tick interval in ms

// ── Pixel art bodies ──────────────────────────────────────────────────────────
// Char key: '.' = transparent · 'c' = ink/outline · 'f' = body fill
//           'e' = eye socket (rendered as fill color; overwritten by eye pixel)

export const BODY: readonly string[] = [
  ".........cc........",
  ".......ccffcc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......ccffcc......",
  ".........cc........",
];

// big-success: top puffs up into a flat white cap + grey band (raised / happy)
export const BODY_SUCCESS: readonly string[] = [
  "........ffff.......",
  ".......cccccc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......ccffcc......",
  ".........cc........",
];

// context > 80%: "full" cloud — flat grey caps top + bottom
export const BODY_CTXHIGH: readonly string[] = [
  "........cccc.......",
  ".......cffffc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......cffffc......",
  "........cccc.......",
];

// context-filling: no eyes, top opens — two grey nubs pulse apart
export const BODY_OPEN: readonly [readonly string[], readonly string[]] = [
  // frame 1 — nubs closer
  [
    "........c..c.......",
    ".......cffffc......",
    "......cffffffc.....",
    "......cffffffc.....",
    ".......ccffcc......",
    ".........cc........",
  ],
  // frame 2 — nubs wider apart
  [
    ".......c....c......",
    ".......cffffc......",
    "......cffffffc.....",
    "......cffffffc.....",
    ".......ccffcc......",
    ".........cc........",
  ],
];

// ── Eye positions [row, col] (pixel coords, BEFORE BASE/dy offset) ─────────
export const EYES: readonly [number, number][] = [
  [2, 8],
  [2, 11],
];

// ── Wisp variants ─────────────────────────────────────────────────────────────

type Cell = [number, number]; // [row, col]

// Mirror cells around the symmetry axis (col 9.5 = 19 - c)
function sym(cells: Cell[]): Cell[] {
  return [...cells, ...cells.map(([r, c]): Cell => [r, W - c])];
}

// Base wisp cells (default idle look — 2 strokes / side = 4 wisps total)
export const WISP_ORIGINAL = sym([
  [3, 3],
  [3, 4],
  [5, 4],
  [5, 5],
]);

// Extra stroke for high-enthusiasm souls (wispCount=6 → 3 strokes/side)
export const WISP_EXTRA = sym([
  [1, 3],
  [1, 4],
]);

export interface WispVariant {
  key: string;
  cells: Cell[];
  w: number; // weight 0–100 (sums to 100)
}

export const WISP_VARIANTS: readonly WispVariant[] = [
  {
    key: "original",
    cells: sym([
      [3, 3],
      [3, 4],
      [5, 4],
      [5, 5],
    ]),
    w: 15,
  },
  {
    key: "short-top",
    cells: sym([
      [3, 4],
      [5, 4],
      [5, 5],
    ]),
    w: 15,
  },
  {
    key: "short-bottom",
    cells: sym([
      [3, 3],
      [3, 4],
      [5, 5],
    ]),
    w: 15,
  },
  {
    key: "clip-top-right",
    cells: sym([
      [3, 3],
      [3, 4],
      [5, 4],
      [5, 5],
    ]).filter(([r, c]) => !(r === 3 && c === W - 3)),
    w: 15,
  },
  {
    key: "clip-top-left",
    cells: sym([
      [3, 3],
      [3, 4],
      [5, 4],
      [5, 5],
    ]).filter(([r, c]) => !(r === 3 && c === 3)),
    w: 15,
  },
  {
    key: "two-stubs",
    cells: sym([
      [2, 3],
      [2, 4],
      [4, 3],
      [4, 4],
    ]),
    w: 13,
  },
  {
    key: "baby-clouds",
    cells: sym([
      [2, 1],
      [2, 2],
      [3, 0],
      [3, 1],
      [3, 2],
    ]),
    w: 8,
  },
  {
    key: "minimal",
    cells: sym([[3, 4]]),
    w: 4,
  },
];

// Weighted pool (length 100) for O(1) random variant selection
export const WISP_POOL: readonly number[] = WISP_VARIANTS.flatMap((v, i) =>
  Array<number>(v.w).fill(i),
);

// Twinkle easter egg: sparkle dots at sprite corners (super-rare, 0.25% chance at 2:15 roll)
export const WISP_TWINKLE = sym([
  [-1, 5],
  [5, 5],
]);
export const TWINKLE_CHANCE = 0.0025;
export const TWINKLE_LEN = 18; // strobe ticks
export const SWAP_TICKS = Math.round(135_000 / TICK_MS); // 2:15 at 80ms/tick ≈ 1687

// ── Gestures ──────────────────────────────────────────────────────────────────

export interface GestureFrame {
  dx?: number;
  blink?: 1;
  eye?: number;
}

export const GESTURES: Readonly<Record<string, readonly GestureFrame[]>> = {
  blink: [{ blink: 1 }, { blink: 1 }],
  double: [{ blink: 1 }, { blink: 1 }, {}, {}, { blink: 1 }, { blink: 1 }],
  lookL: Array<GestureFrame>(7).fill({ eye: -1 }),
  lookR: Array<GestureFrame>(7).fill({ eye: 1 }),
  swayL: Array<GestureFrame>(13).fill({ dx: -1 }),
  swayR: Array<GestureFrame>(13).fill({ dx: 1 }),
} as const;

export const GESTURE_NAMES = Object.keys(GESTURES);

// ── Breathing ─────────────────────────────────────────────────────────────────
// 1px float for part of a ~68-tick cycle (~2× gap between breaths)
export function breatheDy(tick: number): number {
  const p = tick % 68;
  return p >= 14 && p < 26 ? 1 : 0;
}

// ── Error shake frame sequence ────────────────────────────────────────────────
export const ERROR_FRAMES: readonly { dx: number; noWisps: true }[] = [
  { dx: -2, noWisps: true },
  { dx: -2, noWisps: true },
  { dx: 2, noWisps: true },
  { dx: 2, noWisps: true },
  { dx: -2, noWisps: true },
  { dx: -2, noWisps: true },
  { dx: 0, noWisps: true },
  { dx: 0, noWisps: true },
];

// Compaction scan positions (eye sweep: left → center → right → center)
export const COMPACTION_SCAN = [-1, 0, 1, 0] as const;
export const COMPACTION_TICKS = 40; // ticks of exclusive compaction mode
