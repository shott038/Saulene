#!/usr/bin/env node
/**
 * ul-wisps.mjs — wisp-variation palette for the mini ul (dark-terminal look).
 *
 * Body is fixed (grey outline + white fill + black eyes, from ul-mini); only the wisp
 * pixels vary. Each variation stamps white 'w' cells around the body. Writes a gallery
 * to docs/ul-wisps.html. Pick one and we fold it back into ul-mini.mjs.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const W = 19, H = 10, DY = 2; // DY = body offset, leaving rows above the head + below for wisps
// fixed body on a 19-wide canvas (3-col pad each side); walls at 6/13, eyes at 8/11
const BODY = [
  ".........cc........",
  ".......ccffcc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......ccffcc......",
  ".........cc........",
];
const COLORS = {
  c: { r: 0xb8, g: 0xb8, b: 0xb8 }, // grey outline
  f: { r: 0xff, g: 0xff, b: 0xff }, // white body fill
  w: { r: 0xff, g: 0xff, b: 0xff }, // white wisps
  e: { r: 0x16, g: 0x13, b: 0x10 }, // black eyes
};

const mirror = (cells) => cells.map(([r, c]) => [r, W - c]); // body symmetric about col 9.5

// the side-wisp styles Samuel kept
const ORIGINAL = [[3, 3], [3, 4], [5, 4], [5, 5]];
const ORIG_SHORT_TOP = [[3, 4], [5, 4], [5, 5]];        // top stub trimmed to 1px (outer removed)
const ORIG_SHORT_BOTTOM = [[3, 3], [3, 4], [5, 5]];     // bottom stub trimmed to 1px (outer removed)
// asymmetric trims — full original on both sides (mirror cols: 3↔16, 4↔15, 5↔14), one pixel removed
const ORIG_FULL = [[3, 3], [3, 4], [5, 4], [5, 5], [3, 16], [3, 15], [5, 15], [5, 14]];
const ORIG_CLIP_TR = ORIG_FULL.filter(([r, c]) => !(r === 3 && c === 16)); // top-right: drop right px
const ORIG_CLIP_TL = ORIG_FULL.filter(([r, c]) => !(r === 3 && c === 3));  // top-left: drop left px
const STUBS = [[2, 3], [2, 4], [4, 3], [4, 4]];
const SPEED = [[1, 3], [1, 4], [2, 2], [2, 3], [2, 4], [3, 3], [3, 4]];
const MINIMAL = [[3, 4]];
const STAGGERED = [[2, 1], [2, 2], [3, 3], [3, 4]];
// asymmetric: three trailing wisps of varied length on the left, a tiny stub right
const WINDSWEPT = [
  [1, 2], [1, 3], [1, 4],                  // short (top)
  [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],  // long (mid)
  [5, 1], [5, 2], [5, 3], [5, 4],          // medium (bottom)
  [3, 16],
];
const DRIZZLE = [[6, 7], [6, 10], [6, 13], [7, 8], [7, 11]]; // droplets under the body

// All cells are BODY-RELATIVE: row 0 = top of cloud. Negative rows = above the head;
// rows 6+ = below it. build() shifts everything down by DY into the canvas.
const ANTENNAE = [[-2, 9], [-1, 9]];                                  // two nubs straight up
const STEAM = [[-1, 9], [-2, 8]];                                     // staggered puffs rising
const COMET = [[2, 3], [2, 4], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [4, 3], [4, 4]]; // tail one side
const BABYCLOUD = [[2, 1], [2, 2], [3, 0], [3, 1], [3, 2]];           // tiny detached cloud each side
const WINGS = [[1, 4], [2, 3], [3, 2], [3, 1]];                       // swept-down wing
const CURLS = [[3, 4], [3, 3], [3, 2], [2, 2], [1, 2]];               // hook curling up
const LONGBREEZE = [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]];          // single long trail both sides
const TWINKLE = [[-1, 5], [5, 5]];                                    // dots at the four corners
const LIGHTNING = [[6, 10], [7, 9], [7, 10], [8, 9]];                 // jagged bolt below
const HEAVYRAIN = [[6, 7], [7, 7], [6, 9], [7, 9], [6, 11], [7, 11], [6, 13], [7, 13]];
const SNOW = [[6, 7], [7, 8], [6, 9], [7, 10], [6, 11], [7, 12], [6, 13]]; // offset flakes
const TORNADO = [[6, 8], [6, 9], [6, 10], [6, 11], [7, 9], [7, 10], [8, 10]]; // funnel narrowing

// Each: left-side wisp cells (auto-mirrored unless sym:false); `extra` = literal cells.
// group "idle" = the core default look (calm); "state" = reactive/weather moods.
const VARIATIONS = [
  // — idle / core default —
  { name: "original", group: "idle", cells: ORIGINAL },
  { name: "original · short top", group: "idle", cells: ORIG_SHORT_TOP },
  { name: "original · short bottom", group: "idle", cells: ORIG_SHORT_BOTTOM },
  { name: "original · clip top-right", group: "idle", sym: false, cells: ORIG_CLIP_TR },
  { name: "original · clip top-left", group: "idle", sym: false, cells: ORIG_CLIP_TL },
  { name: "two stubs", group: "idle", cells: STUBS },
  { name: "minimal", group: "idle", cells: MINIMAL },
  { name: "baby clouds", group: "idle", cells: BABYCLOUD },
  // — reactive states —
  { name: "staggered", group: "state", cells: STAGGERED },
  { name: "windswept", group: "state", sym: false, cells: WINDSWEPT },
  { name: "cloud + drizzle", group: "state", cells: [], extra: DRIZZLE },
  { name: "minimal + drizzle", group: "state", cells: MINIMAL, extra: DRIZZLE },
  { name: "windswept + drizzle", group: "state", sym: false, cells: WINDSWEPT, extra: DRIZZLE },
  { name: "steam rising", group: "state", cells: STEAM },
  { name: "comet", group: "state", sym: false, cells: COMET },
  { name: "wings", group: "state", cells: WINGS },
  { name: "twinkle", group: "state", cells: TWINKLE },
  { name: "lightning", group: "state", cells: [], extra: LIGHTNING },
  { name: "heavy rain", group: "state", cells: [], extra: HEAVYRAIN },
  { name: "snow", group: "state", cells: [], extra: SNOW },
  { name: "tornado", group: "state", cells: [], extra: TORNADO },
];

function build(v) {
  const px = Array.from({ length: H }, () => Array(W).fill(null));
  BODY.forEach((row, r) => { for (let c = 0; c < W; c++) { const col = COLORS[row[c]]; if (col) px[r + DY][c] = col; } });
  const cells = (v.sym === false ? v.cells : v.cells.concat(mirror(v.cells))).concat(v.extra ?? []);
  for (const [r, c] of cells) { const rr = r + DY; if (px[rr] && c >= 0 && c < W && !px[rr][c]) px[rr][c] = COLORS.w; }
  return { w: W, h: H, px };
}

function toHtml({ w, h, px }, cell = 13) {
  let cells = "";
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const p = px[r][c];
    if (p) cells += `<i style="grid-row:${r + 1};grid-column:${c + 1};background:rgb(${p.r},${p.g},${p.b})"></i>`;
  }
  return `<div class="px" style="display:grid;grid-template-columns:repeat(${w},${cell}px);grid-template-rows:repeat(${h},${cell}px)">${cells}</div>`;
}

const tile = (v) => `<div class="tile"><div class="px-wrap">${toHtml(build(v))}</div><div class="name">${v.name}</div></div>`;
const section = (title, sub, group) =>
  `<h2>${title}<span>${sub}</span></h2><div class="grid">${VARIATIONS.filter((v) => v.group === group).map(tile).join("")}</div>`;
const html = `<!doctype html><meta charset="utf-8"><title>ul wisp palette</title>
<style>
  body{margin:0;background:#1e1e1e;font:12px ui-sans-serif,system-ui;padding:24px}
  h1{color:#aaa;font-size:13px;font-weight:600;letter-spacing:.06em;margin:0 0 20px}
  h2{color:#ddd;font-size:13px;font-weight:600;letter-spacing:.04em;margin:28px 0 14px;border-top:1px solid #2a2a2a;padding-top:20px}
  h2 span{color:#777;font-weight:400;margin-left:10px;font-size:11px}
  .grid{display:flex;flex-wrap:wrap;gap:14px}
  .tile{background:#181818;border:1px solid #2a2a2a;border-radius:8px;padding:16px;width:280px}
  .px-wrap{display:flex;justify-content:center;align-items:center;height:150px}
  .name{color:#888;font-size:11px;text-align:center;margin-top:10px;letter-spacing:.06em;text-transform:uppercase}
  .px i{display:block}
</style>
<h1>ul — wisp variations (dark terminal)</h1>
${section("IDLE", "core default — calm", "idle")}
${section("REACTIVE STATES", "weather / mood", "state")}`;
writeFileSync(fileURLToPath(new URL("../docs/ul-wisps.html", import.meta.url)), html);
console.log("preview → docs/ul-wisps.html");
