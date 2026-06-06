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
// success: top puffs up into a flat white cap + grey band (raised / happy)
const BODY_SUCCESS = [
  "........ffff.......",
  ".......cccccc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......ccffcc......",
  ".........cc........",
];
// context > 80%: the cloud reads "full" — flat grey caps top & bottom, denser/closed body
const BODY_CTXHIGH = [
  "........cccc.......",
  ".......cffffc......",
  "......cfeffefc.....",
  "......cffffffc.....",
  ".......cffffc......",
  "........cccc.......",
];
// context-filling: no eyes, top opens — two grey nubs pulse apart (frame 1 → frame 2)
const BODY_OPEN = [
  [ // frame 1 — nubs closer
    "........c..c.......",
    ".......cffffc......",
    "......cffffffc.....",
    "......cffffffc.....",
    ".......ccffcc......",
    ".........cc........",
  ],
  [ // frame 2 — nubs wider apart
    ".......c....c......",
    ".......cffffc......",
    "......cffffffc.....",
    "......cffffffc.....",
    ".......ccffcc......",
    ".........cc........",
  ],
];
const W = 19, H = 8, BASE = 1; // BASE = resting row offset → leaves 1px headroom for the prompt hop
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

// REACTIVE — error: fast jerk left→right→left→center; wisps vanish for the whole shake
const ERROR = [
  { dx: -2, noWisps: 1 }, { dx: -2, noWisps: 1 },
  { dx: 2, noWisps: 1 }, { dx: 2, noWisps: 1 },
  { dx: -2, noWisps: 1 }, { dx: -2, noWisps: 1 },
  { dx: 0, noWisps: 1 }, { dx: 0, noWisps: 1 },
];

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
function compose(wisps, { dx = 0, blink = 0, eye = 0, eyeDy = 0, open = 0, wdy = 0, ctx = 0, win = 0, success = 0 } = {}, dy = 0) {
  const px = Array.from({ length: H }, () => Array(W).fill(null));
  const body = open ? BODY_OPEN[open - 1] : success ? BODY_SUCCESS : ctx ? BODY_CTXHIGH : BODY;
  for (let r = 0; r < body.length; r++) for (let c = 0; c < W; c++) {
    const ch = body[r][c];
    if (ch === ".") continue;
    const rr = r + BASE + dy, cc = c + dx;
    if (rr >= 0 && rr < H && cc >= 0 && cc < W) px[rr][cc] = ch === "e" ? HEX.f : HEX[ch];
  }
  if (!blink && !open) for (const [er, ec] of EYES) {
    const rr = er + BASE + dy + eyeDy, cc = ec + eye + dx;
    if (rr >= 0 && rr < H && cc >= 0 && cc < W) px[rr][cc] = HEX.e;
  }
  for (const [r, c] of wisps) {  // wisps: own vertical offset (wdy); win pulls them inward (thinking)
    const inward = c < 9.5 ? win : -win;          // both sides slide toward center
    const rr = r + BASE + wdy, cc = c + inward + dx;
    if (rr >= 0 && rr < H && cc >= 0 && cc < W && !px[rr][cc]) px[rr][cc] = WISP; // absorbed when it reaches the body
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

if (process.argv.includes("--export-response")) {
  // response finished: wisps push out 1px on both sides, then back to default
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 6; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });
  for (let i = 0; i < 9; i++) frames.push({ d: 80, p: compose(cells, { win: -1 }, 0) }); // out 1px
  for (let t = 0; t < 8; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });          // back
  const out = fileURLToPath(new URL("../docs/ul-response-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-compaction")) {
  // context compaction: eyes drop 1px, then scan left → middle → right → middle (loop)
  const seq = [-1, 0, 1, 0];                       // wisps gone for the whole compaction
  const frames = [];
  for (let t = 0; t < 4; t++) frames.push({ d: 60, p: compose([], {}, 0) });           // eyes centered, wisps gone
  for (let t = 0; t < 3; t++) frames.push({ d: 60, p: compose([], { eyeDy: 1 }, 0) }); // eyes drop down
  for (let n = 0; n < 48; n++) frames.push({ d: 45, p: compose([], { eyeDy: 1, eye: seq[n % 4] }, 0) }); // fast scan (1 tick/pos)
  const out = fileURLToPath(new URL("../docs/ul-compaction-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-retry")) {
  // retry: wisps vanish then reappear, once per retry attempt
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 6; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });
  for (let r = 0; r < 3; r++) {                                       // three retries
    for (let i = 0; i < 5; i++) frames.push({ d: 80, p: compose([], {}, 0) });
    for (let i = 0; i < 8; i++) frames.push({ d: 80, p: compose(cells, {}, 0) });
  }
  const out = fileURLToPath(new URL("../docs/ul-retry-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-success")) {
  // success: pop body up 1px into the white-cap "success" body, hold, settle back. wisps kept.
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 8; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });             // default position
  for (let i = 0; i < 14; i++) frames.push({ d: 80, p: compose(cells, { success: 1 }, -1) }); // up 1px + success body
  for (let t = 0; t < 10; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });            // back to default
  const out = fileURLToPath(new URL("../docs/ul-success-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-thinking")) {
  // thinking: wisps slide into the body and vanish, held while thinking, then slide back out
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 10; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });
  for (let w = 1; w <= 5; w++) frames.push({ d: 60, p: compose(cells, { win: w }, 0) });
  for (let t = 0; t < 24; t++) frames.push({ d: 80, p: compose(cells, { win: 5 }, 0) }); // thinking (no wisps)
  for (let w = 4; w >= 0; w--) frames.push({ d: 60, p: compose(cells, { win: w }, 0) });
  for (let t = 0; t < 8; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });
  const out = fileURLToPath(new URL("../docs/ul-thinking-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-ctxhigh")) {
  // context > 80% default: the "full" body, idle anims still play (breathe + blink + look), no swap
  const frames = [], cells = ORIGINAL;
  const push = (ov, dy) => frames.push({ d: 80, p: compose(cells, { ctx: 1, ...ov }, dy) });
  for (let t = 0; t < 16; t++) push({}, breatheDy(t));                 // breathing
  G.blink.forEach(() => push({ blink: 1 }, 1));                         // blink
  for (let t = 0; t < 10; t++) push({}, breatheDy(t));
  G.lookL.forEach(() => push({ eye: -1 }, 1));                          // glance left
  for (let t = 0; t < 8; t++) push({}, 0);
  G.lookR.forEach(() => push({ eye: 1 }, 1));                           // glance right
  for (let t = 0; t < 12; t++) push({}, breatheDy(t));
  const out = fileURLToPath(new URL("../docs/ul-ctxhigh-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-prompt")) {
  // user submits a prompt: quick 1px hop up, then back down. wisps stay put.
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 8; t++) frames.push({ d: 80, p: compose(cells, {}, breatheDy(t)) });
  frames.push({ d: 60, p: compose(cells, { wdy: 1 }, -1) });   // body up, wisps down
  frames.push({ d: 60, p: compose(cells, { wdy: 1 }, -1) });
  for (let t = 0; t < 10; t++) frames.push({ d: 80, p: compose(cells, {}, breatheDy(t)) });
  const out = fileURLToPath(new URL("../docs/ul-prompt-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-ctx")) {
  // context-filling demo: idle → drop down (breathing dip), eyes off, hold frame 2 while taking
  // in context → frame 1 as it closes → back to default. wisps kept.
  const frames = [], cells = ORIGINAL;
  for (let t = 0; t < 10; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });                  // default position
  for (let i = 0; i < 24; i++) frames.push({ d: 90, p: compose(cells, { blink: 1, open: 2 }, 1) }); // taking in → hold frame 2
  frames.push({ d: 55, p: compose(cells, { blink: 1, open: 1 }, 1) });  // closing → quick frame 1 (in-between beat)
  for (let t = 0; t < 10; t++) frames.push({ d: 80, p: compose(cells, {}, 0) });                  // back to default
  const out = fileURLToPath(new URL("../docs/ul-ctx-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export-error")) {
  // error demo loop: calm → fast shake (wisps gone) → calm
  const frames = [];
  const cells = ORIGINAL;
  for (let t = 0; t < 12; t++) frames.push({ d: 80, p: compose(cells, {}, breatheDy(t)) });
  for (const ov of ERROR) frames.push({ d: 70, p: compose([], ov, 0) });
  for (let t = 0; t < 16; t++) frames.push({ d: 80, p: compose(cells, {}, breatheDy(t)) });
  const out = fileURLToPath(new URL("../docs/ul-error-frames.json", import.meta.url));
  writeFileSync(out, JSON.stringify({ w: W, h: H, bg: BG, frames }));
  console.log(`wrote ${frames.length} frames → ${out}`);
} else if (process.argv.includes("--export")) {
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
    const wisps = ov.noWisps ? [] : VARIANTS[variant].cells;
    const frame = toAnsi(compose(wisps, ov, breatheDy(tick++)));
    if (!first) process.stdout.write(`\x1b[${CHAR_ROWS}A`);
    first = false;
    process.stdout.write(frame);
  }, 80);
  timer.unref?.();
}
