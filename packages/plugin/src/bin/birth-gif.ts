/**
 * @saulene/plugin — export birth animations to frames JSON for scripts/_gif.py.
 *
 * Renders the SAME birth choreography the wizard plays (gather → wisps drift in → condense
 * center→up→down → spark → wake → first breath) for the canonical DEFAULT sprite AND a few
 * trait-individualized souls, so the birth COLOR variation is visible. Color comes from the real
 * pipeline: spriteParams(soul) → colorsFromParams (hue ← openness×intellect: common warm
 * terracotta → rare violet unicorn; saturation ← industriousness).
 *
 * Writes docs/ul-birth[-<name>]-frames.json; scripts/_gif.py renders each to a GIF. Run:
 *   pnpm --filter @saulene/plugin birth-gif
 *   python3 scripts/_gif.py docs/ul-birth-unicorn-frames.json docs/ul-birth-unicorn.gif   # etc.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Soul, seedFromEntropy } from "@saulene/core";
import { spriteParams } from "@saulene/renderer";
import { birthFrameGrid, birthFrames } from "../statusline/birth.js";
import {
  type RasterizerColors,
  type RgbColor,
  colorsFromParams,
} from "../statusline/rasterizer.js";
import { H, W } from "../statusline/sprite-data.js";

const BG = "#0c0c0c";
const hex = (rgb: RgbColor): string =>
  `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/** A newborn soul with chosen color-driving traits (the rest neutral at 0.5). */
function soulWith(openness: number, intellect: number, industriousness: number): Soul {
  const base = seedFromEntropy(new Uint8Array(32).fill(7), 0);
  return { ...base, mp: 0, v: { ...base.v, openness, intellect, industriousness } };
}

const colorsFor = (o: number, i: number, ind: number): RasterizerColors =>
  colorsFromParams(spriteParams(soulWith(o, i, ind)), "dark");

// The canonical default (dark mode) + trait-individualized archetypes.
const DEFAULT_COLORS: RasterizerColors = {
  fill: [255, 255, 255],
  ink: [184, 184, 184],
  wisp: [255, 255, 255],
  eye: [22, 19, 16],
};

const VARIANTS: { name: string; colors: RasterizerColors }[] = [
  { name: "default", colors: DEFAULT_COLORS },
  { name: "unicorn", colors: colorsFor(0.95, 0.92, 0.72) }, // high O×I → rare violet
  { name: "terracotta", colors: colorsFor(0.2, 0.25, 0.72) }, // low O×I → common warm
  { name: "twilight", colors: colorsFor(0.62, 0.6, 0.72) }, // mid blend
];

for (const { name, colors } of VARIANTS) {
  const frames = birthFrames().map((fr) => ({
    p: birthFrameGrid(fr, colors).map((row) => row.map((cell) => (cell ? hex(cell) : null))),
    d: fr.delayMs,
  }));
  const file = name === "default" ? "ul-birth-frames.json" : `ul-birth-${name}-frames.json`;
  const dst = fileURLToPath(new URL(`../../../../docs/${file}`, import.meta.url));
  writeFileSync(dst, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${name}: ${frames.length} frames → ${file}  (fill ${hex(colors.fill)})`);
}
