/**
 * @saulene/plugin — export the birth animation to a frames JSON for scripts/_gif.py.
 *
 * Renders the SAME birth choreography the wizard plays (wisps drift in → center appears →
 * slow center-out bloom to full size → settle) for the canonical default terminal sprite.
 * Every ul looks the same (sprite color is not individualized), so there is one birth.
 *
 * Writes docs/ul-birth-frames.json; scripts/_gif.py renders docs/ul-birth.gif. Run:
 *   pnpm --filter @saulene/plugin birth-gif
 *   python3 scripts/_gif.py docs/ul-birth-frames.json docs/ul-birth.gif
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { birthFrameGrid, birthFrames } from "../statusline/birth.js";
import type { RasterizerColors, RgbColor } from "../statusline/rasterizer.js";
import { H, W } from "../statusline/sprite-data.js";

// The canonical default terminal sprite in dark mode (matches colorsFromParams's dark palette).
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
