#!/usr/bin/env node
/**
 * ul-idle.mjs — idle animation engine for the core-default ul (dark-terminal look).
 *
 * Baseline = slow breathing (gentle 1px float; the body bobs, the wisps stay put). On top
 * of that, calm gestures fire at random intervals: blink, double-blink, look L/R, sway L/R.
 * And every so often the sprite swaps to another idle wisp variant — the 5 "original" ones
 * are common; two-stubs less so, baby-clouds rarer, minimal rarest.
 *
 *   node scripts/ul-idle.mjs                 # live animation in this terminal (Ctrl-C to stop)
 *   node scripts/ul-idle.mjs --export        # write docs/ul-idle-frames.json for the GIF
 *
 * Sprite coords match the wisp gallery (ul-wisps.mjs): 19-wide, body-relative cells.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BODY = [
  ".........cc........",
  ".......ccffcc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......ccffcc......",
  ".........cc........",
];
const W = 19, H = 7;
const EYES = [[2, 8], [2, 11]];
const HEX = { c: "#b8b8b8", f: "#ffffff", e: "#161310" }, WISP = "#ffffff";
const BG = "#1e1e1e";

// breathing: 1px float for part of a ~68-tick cycle (~2x gap between breaths)
const breatheDy = (t) => { const p = t % 68; return p >= 14 && p < 26 ? 1 : 0; };

// gesture = per-tick overlay frames {blink, eye(shift), dx}
const G = {
  blink:  [{ blink: 1 }, { blink: 1 }],
  double: [{ blink: 1 }, { blink: 1 }, {}, {}, { blink: 1 }, { blink: 1 }],
  lookL:  Array(7).fill({ eye: -1 }),
  lookR:  Array(7).fill({ eye: 1 }),
  swayL:  Array(13).fill({ dx: -1 }), // drift left and hold ~1s
  swayR:  Array(13).fill({ dx: 1 }),  // drift right and hold ~1s
};
const GESTURES = ["blink", "double", "lookL", "lookR", "swayL", "swayR"];

// idle wisp variants (mirror axis col 9.5 → 19-c).
// w = % chance on each swap roll (sums to 100); absolute roll, may re-land on the same one.
const sym = (cells) => cells.concat(cells.map(([r, c]) => [r, 19 - c]));
const ORIGINAL = sym([[3, 3], [3, 4], [5, 4], [5, 5]]);
const VARIANTS = [
  { key: "original",       cells: ORIGINAL, w: 15 },
  { key: "short top",      cells: sym([[3, 4], [5, 4], [5, 5]]), w: 15 },
  { key: "short bottom",   cells: sym([[3, 3], [3, 4], [5, 5]]), w: 15 },
  { key: "clip top-right", cells: ORIGINAL.filter(([r, c]) => !(r === 3 && c === 16)), w: 15 },
  { key: "clip top-left",  cells: ORIGINAL.filter(([r, c]) => !(r === 3 && c === 3)), w: 15 },
  { key: "two stubs",      cells: sym([[2, 3], [2, 4], [4, 3], [4, 4]]), w: 13 },
  { key: "baby clouds",    cells: sym([[2, 1], [2, 2], [3, 0], [3, 1], [3, 2]]), w: 8 },
  { key: "minimal",        cells: sym([[3, 4]]), w: 4 },
];
const POOL = VARIANTS.flatMap((v, i) => Array(v.w).fill(i)); // length 100
const rollVariant = () => POOL[Math.floor(Math.random() * POOL.length)];
const SWAP_MS = 135000; // 2:15

/** Compose one frame → 2D array of hex|null. Body bobs with dy; wisps take dx only. */
function compose(wisps, { dx = 0, blink = 0, eye = 0 } = {}, dy = 0) {
  const px = Array.from({ length: H }, () => Array(W).fill(null));
  for (let r = 0; r < BODY.length; r++) for (let c = 0; c < W; c++) {
    const ch = BODY[r][c];
    if (ch === ".") continue;
    const rr = r + dy, cc = c + dx;
    if (rr >= 0 && rr < H && cc >= 0 && cc < W) px[rr][cc] = ch === "e" ? HEX.f : HEX[ch];
  }
  if (!blink) for (const [er, ec] of EYES) {
    const rr = er + dy, cc = ec + eye + dx;
    if (rr >= 0 && rr < H && cc >= 0 && cc < W) px[rr][cc] = HEX.e;
  }
  for (const [r, c] of wisps) {
    const cc = c + dx;
    if (r >= 0 && r < H && cc >= 0 && cc < W && !px[r][cc]) px[r][cc] = WISP;
  }
  return px;
}

// ── ANSI half-blocks ──
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const fg = (h) => { const [r, g, b] = rgb(h); return `\x1b[38;2;${r};${g};${b}m`; };
const bg = (h) => { const [r, g, b] = rgb(h); return `\x1b[48;2;${r};${g};${b}m`; };
const RESET = "\x1b[0m";
function toAnsi(px, indent = "  ") {
  let out = "";
  for (let r = 0; r < H; r += 2) {
    out += indent;
    for (let c = 0; c < W; c++) {
      const t = px[r][c], b = r + 1 < H ? px[r + 1][c] : null;
      if (!t && !b) out += `${RESET} `;
      else if (t && b) out += `${fg(t)}${bg(b)}▀${RESET}`;
      else if (t) out += `${fg(t)}▀${RESET}`;
      else out += `${fg(b)}▄${RESET}`;
    }
    out += "\n";
  }
  return out;
}
const CHAR_ROWS = Math.ceil(H / 2);

if (process.argv.includes("--export")) {
  // deterministic ~12s timeline for the GIF: gestures + a couple of variant swaps
  const N = 150;
  const gscript = [[16, "blink"], [40, "lookL"], [64, "double"], [90, "swayL"], [116, "swayR"]];
  const overlays = Array.from({ length: N }, () => ({}));
  for (const [at, type] of gscript) G[type].forEach((f, i) => { if (at + i < N) overlays[at + i] = f; });
  const vswaps = [[0, 0], [52, 5], [104, 6]]; // tick → variant index (original → two stubs → baby clouds)
  const frames = [];
  let vi = 0;
  for (let t = 0; t < N; t++) {
    for (const [at, idx] of vswaps) if (t === at) vi = idx;
    frames.push({ d: 80, p: compose(VARIANTS[vi].cells, overlays[t], breatheDy(t)) });
  }
  const out = fileURLToPath(new URL("../docs/ul-idle-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else {
  // live player: breathing + random gestures + occasional variant swap
  process.stdout.write("\x1b[?25l");
  let active = null, gi = 0, cooldown = 30, tick = 0, first = true;
  let variant = 0, lastSwap = Date.now();
  const cleanup = () => { process.stdout.write("\x1b[?25h\n"); process.exit(0); };
  process.on("SIGINT", cleanup);
  const timer = setInterval(() => {
    if (Date.now() - lastSwap >= SWAP_MS && !active) { variant = rollVariant(); lastSwap = Date.now(); }
    let ov = {};
    if (active) { ov = active[gi++]; if (gi >= active.length) { active = null; cooldown = 25 + Math.floor(Math.random() * 45); } }
    else if (--cooldown <= 0) { active = G[GESTURES[Math.floor(Math.random() * GESTURES.length)]]; gi = 0; }
    const frame = toAnsi(compose(VARIANTS[variant].cells, ov, breatheDy(tick++)));
    if (!first) process.stdout.write(`\x1b[${CHAR_ROWS}A`);
    first = false;
    process.stdout.write(frame);
  }, 80);
  timer.unref?.();
}
