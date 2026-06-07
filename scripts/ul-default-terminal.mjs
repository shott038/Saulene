#!/usr/bin/env node
/**
 * ul-default-terminal.mjs — render the LOCKED default ul as a terminal sprite.
 *
 * This is the real default look (docs/ul-default.svg) made to sit in a terminal during a
 * session, from the source-of-truth geometry (ul-geometry.mjs). Two modes:
 *   - "dark"  (default): for the typical dark terminal. The cloud is a solid white shape
 *             (built from the OUTER ink silhouette, so it reads round & bumpy), dark eyes,
 *             and WHITE wisps — so the outline/wisps survive a dark background.
 *   - "light": the literal default — white body, ink outline ring, ink eyes, ink wisps —
 *             for light terminals (cream/white), where the ink reads as crisp line-art.
 * Eyes are nudged a touch larger/wider than the SVG so they stay two distinct dots when small.
 *
 * A terminal can't draw SVG but it can print 24-bit-color Unicode half-blocks (▀/▄): two
 * vertical pixels per character cell (fg = top, bg = bottom). Cells are ~1:2, so each
 * half-pixel is square — we keep the SVG aspect by deriving rows from cols. Edges are
 * supersampled (coverage AA) so the cloud stays smooth and on-model when small.
 *
 *   node scripts/ul-default-terminal.mjs            # dark mode, 30 cols, prints + writes preview
 *   node scripts/ul-default-terminal.mjs 24 light   # narrower, light mode
 *
 * toHtml() renders the SAME grid, so the HTML preview is pixel-identical to the terminal.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BODY, INK, INK_COLOR, PAPER, WISPS } from "./ul-geometry.mjs";

// crop window around the cloud incl. the outer wind-wisps (svg units)
const X0 = 44;
const X1 = 256;
const Y0 = 42;
const Y1 = 160;
const WISP_HALF = 2; // stroke-width 4 → half-width 2
const SS = 4; // supersamples per axis (16 subsamples / pixel)
const COVERAGE = 0.5;
// Eyes: stamped as one pure-ink pixel each (mapped from these svg points), so they stay
// the same crisp two-dot face at every resolution instead of scaling with the grid.
const EYES_T = [
  [141, 108],
  [159, 108],
];

const hex = (h) => ({
  r: Number.parseInt(h.slice(1, 3), 16),
  g: Number.parseInt(h.slice(3, 5), 16),
  b: Number.parseInt(h.slice(5, 7), 16),
});
const INKC = hex(INK_COLOR);
const PAPERC = hex(PAPER);

// per-mode palette: which paint fills body / outer ring / eyes / wisps
const MODES = {
  dark: { body: PAPERC, ring: PAPERC, eye: INKC, wisp: PAPERC }, // solid white cloud on dark
  light: { body: PAPERC, ring: INKC, eye: INKC, wisp: INKC }, // literal ink line-art on light
};

const inCircles = (circles, x, y) =>
  circles.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
const onWisp = (x, y) =>
  WISPS.some(
    ([x1, x2, wy]) =>
      y >= wy - WISP_HALF && y <= wy + WISP_HALF && x >= x1 - WISP_HALF && x <= x2 + WISP_HALF,
  );

// Bulge the 8 outer puffs (index 0 is the center seed) so they read as distinct cloud
// lobes instead of melting into one smooth diamond hull at terminal resolution.
const PUFF_INFLATE = 0;
const ring = (circles, inflate) =>
  circles.map(([cx, cy, r], i) => [cx, cy, i === 0 ? r : r + inflate]);

// color at a single svg point (body/ring/wisp only — eyes are a post-pass); null = transparent
function sample(x, y, pal, silhouette) {
  if (inCircles(BODY, x, y)) return pal.body; // body (drawn over the ring)
  if (inCircles(silhouette, x, y)) return pal.ring; // outer silhouette ring (puffed)
  if (onWisp(x, y)) return pal.wisp; // wind-wisps
  return null;
}

/** Rasterize the default look. Returns { w, h, px } with px[row][col] = {r,g,b} | null. */
export function renderDefault(cols = 30, mode = "dark", opts = {}) {
  const { inflate = PUFF_INFLATE, coverage = COVERAGE } = opts;
  const pal = MODES[mode] ?? MODES.dark;
  const silhouette = ring(INK, inflate);
  const ps = (X1 - X0) / cols;
  const rows = Math.round((Y1 - Y0) / ps);
  const step = ps / SS;
  const px = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < cols; c++) {
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let i = 0; i < SS; i++) {
        const sy = Y0 + r * ps + (i + 0.5) * step;
        for (let j = 0; j < SS; j++) {
          const sx = X0 + c * ps + (j + 0.5) * step;
          const col = sample(sx, sy, pal, silhouette);
          if (col) {
            n++;
            sr += col.r;
            sg += col.g;
            sb += col.b;
          }
        }
      }
      // coverage threshold; internal body/ink edges blend via the averaged color
      line.push(
        n / (SS * SS) >= coverage
          ? { r: Math.round(sr / n), g: Math.round(sg / n), b: Math.round(sb / n) }
          : null,
      );
    }
    px.push(line);
  }
  // eyes: one pure-ink pixel each, only where it lands on the body (so it never floats)
  for (const [ex, ey] of EYES_T) {
    const c = Math.floor((ex - X0) / ps);
    const r = Math.floor((ey - Y0) / ps);
    if (px[r]?.[c]) px[r][c] = pal.eye;
  }
  return { w: cols, h: rows, px };
}

// ── ANSI (real terminal) ──────────────────────────────────────────────────────
const fg = (c) => `\x1b[38;2;${c.r};${c.g};${c.b}m`;
const bg = (c) => `\x1b[48;2;${c.r};${c.g};${c.b}m`;
const RESET = "\x1b[0m";

export function toAnsi(grid, indent = "") {
  const { w, h, px } = grid;
  let out = "";
  for (let r = 0; r < h; r += 2) {
    out += indent;
    for (let c = 0; c < w; c++) {
      const top = px[r][c];
      const bot = r + 1 < h ? px[r + 1][c] : null;
      if (!top && !bot) out += `${RESET} `;
      else if (top && bot) out += `${fg(top)}${bg(bot)}▀${RESET}`;
      else if (top) out += `${fg(top)}▀${RESET}`;
      else out += `${fg(bot)}▄${RESET}`;
    }
    out += "\n";
  }
  return out;
}

// ── HTML (verification preview; identical grid → identical look) ──
export function toHtml(grid, cell = 8) {
  const { w, h, px } = grid;
  let cells = "";
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const p = px[r][c];
      if (p)
        cells += `<i style="grid-row:${r + 1};grid-column:${c + 1};background:rgb(${p.r},${p.g},${p.b})"></i>`;
    }
  return `<div class="px" style="display:grid;grid-template-columns:repeat(${w},${cell}px);grid-template-rows:repeat(${h},${cell}px)">${cells}</div>`;
}

// ── CLI ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cols = Number(process.argv[2]) || 30;
  const mode = process.argv[3] === "light" ? "light" : "dark";
  process.stdout.write(`\n${toAnsi(renderDefault(cols, mode), "  ")}\n`);

  // write an HTML preview: each mode shown on the background it's designed for
  const sizes = [40, 30, 22, 16];
  const cell = (n, m) => {
    const g = renderDefault(n, m);
    return `<div class="cell"><div class="cap">${n}×${g.h} px → ${n}×${Math.ceil(g.h / 2)} chars</div>${toHtml(g)}</div>`;
  };
  const panel = (bg, label, m) => `
    <div class="panel" style="background:${bg}">
      <div class="label">${label}</div>
      <div class="row">${sizes.map((n) => cell(n, m)).join("")}</div>
    </div>`;
  const html = `<!doctype html><meta charset="utf-8"><title>ul — default terminal sprite</title>
<style>
  body{margin:0;font:13px ui-sans-serif,system-ui;background:#111}
  .panel{padding:28px 24px}
  .label{color:#888;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px}
  .row{display:flex;gap:36px;align-items:flex-end;flex-wrap:wrap}
  .cap{color:#666;font-size:10px;margin-bottom:8px;font-variant-numeric:tabular-nums}
  .px i{display:block}
</style>
${panel("#1e1e1e", "DARK mode — on a dark terminal (the default target)", "dark")}
${panel("#0d1117", "DARK mode — on a near-black terminal", "dark")}
${panel("#efeae0", "LIGHT mode — on cream (ul-default.svg bg)", "light")}
${panel("#ffffff", "LIGHT mode — on white", "light")}`;
  const out = fileURLToPath(new URL("../docs/ul-default-terminal.html", import.meta.url));
  writeFileSync(out, html);
  process.stdout.write(`  preview → ${out}\n\n`);
}
