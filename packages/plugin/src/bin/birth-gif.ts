/**
 * @saulene/plugin — export the default-sprite birth animation to a frames JSON.
 *
 * Renders the SAME birth choreography the wizard plays (gather → wisps drift in → condense
 * center→up→down → spark → wake → first breath) for the canonical DEFAULT terminal sprite
 * (grey outline, white fill + wisps, near-black eyes — the docs/ul-default.svg look in dark mode).
 *
 * Writes docs/ul-birth-frames.json in the format scripts/_gif.py consumes; that script renders
 * docs/ul-birth.gif. Run:
 *   pnpm --filter @saulene/plugin birth-gif   # writes the frames JSON
 *   python3 scripts/_gif.py docs/ul-birth-frames.json docs/ul-birth.gif
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { birthFrameGrid, birthFrames } from "../statusline/birth.js";
import type { RasterizerColors, RgbColor } from "../statusline/rasterizer.js";
import { H, W } from "../statusline/sprite-data.js";

// The canonical default terminal sprite in dark mode (see rasterizer.ts header + docs/ul-default.svg).
const DEFAULT_COLORS: RasterizerColors = {
  fill: [255, 255, 255],
  ink: [184, 184, 184],
  wisp: [255, 255, 255],
  eye: [22, 19, 16],
};
const BG = "#0c0c0c";

const hex = (rgb: RgbColor): string =>
  `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;

const frames = birthFrames().map((fr) => ({
  p: birthFrameGrid(fr, DEFAULT_COLORS).map((row) => row.map((cell) => (cell ? hex(cell) : null))),
  d: fr.delayMs,
}));

const dst = fileURLToPath(new URL("../../../../docs/ul-birth-frames.json", import.meta.url));
writeFileSync(dst, JSON.stringify({ w: W, h: H, bg: BG, frames }));
console.log(`wrote ${frames.length} birth frames → ${dst}`);
