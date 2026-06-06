#!/usr/bin/env node
/**
 * ul-mini.mjs — the tiny cyan ul sprite for the statusline (from Samuel's pixel art).
 *
 * Cloud pixels extracted from ~/Downloads/pixil-frame-0.png; the gray/black frame is
 * dropped (not part of the sprite). Chars: '.' transparent · 'c' body outline ·
 * 'f' body fill · 'w' wisp (the detached flying bits) · 'e' eye.
 *
 * Colors are mode-dependent:
 *   - light terminal: all cyan outline, hollow body, black eyes (the source art)
 *   - dark terminal:  light-grey outline, white body fill, white wisps, black eyes
 *
 *   node scripts/ul-mini.mjs            # dark mode + writes docs/ul-mini.html
 *   node scripts/ul-mini.mjs light      # light mode (all cyan)
 *
 * Two vertical pixels per character cell via ▀ (fg = top px, bg = bottom px).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// cloud pixels from the source PNG (frame stripped); 'w' = wisps, 'f' = interior fill
const GRID = `
......cc.....
....ccffcc...
...cfeffefc..
ww.cffffffc.w
....ccffcc...
.ww...cc...ww
`;

const CYAN = { r: 0x99, g: 0xd9, b: 0xea };   // 153,217,234
const WHITE = { r: 0xff, g: 0xff, b: 0xff };
const BLACK = { r: 0x16, g: 0x13, b: 0x10 };
const GREY = { r: 0xb8, g: 0xb8, b: 0xb8 };   // light grey body outline (dark mode)
const palette = (mode) =>
  mode === "light"
    ? { c: CYAN, w: CYAN, e: BLACK }              // 'f' → transparent: stays hollow
    : { c: GREY, f: WHITE, w: WHITE, e: BLACK };

export function parse(grid, mode = "dark") {
  const COLORS = palette(mode);
  const rows = grid.replace(/^\n|\n$/g, "").split("\n");
  const w = Math.max(...rows.map((r) => r.length));
  const px = rows.map((r) => Array.from({ length: w }, (_, i) => COLORS[r[i]] ?? null));
  return { w, h: px.length, px };
}
export const sprite = (mode = "dark") => parse(GRID, mode);

// ── ANSI half-blocks (real terminal / statusline) ──
const fg = (c) => `\x1b[38;2;${c.r};${c.g};${c.b}m`;
const bg = (c) => `\x1b[48;2;${c.r};${c.g};${c.b}m`;
const RESET = "\x1b[0m";
export function toAnsi({ w, h, px }, indent = "") {
  let out = "";
  for (let r = 0; r < h; r += 2) {
    out += indent;
    for (let c = 0; c < w; c++) {
      const top = px[r][c], bot = r + 1 < h ? px[r + 1][c] : null;
      if (!top && !bot) out += `${RESET} `;
      else if (top && bot) out += `${fg(top)}${bg(bot)}▀${RESET}`;
      else if (top) out += `${fg(top)}▀${RESET}`;
      else out += `${fg(bot)}▄${RESET}`;
    }
    out += "\n";
  }
  return out;
}

// ── HTML (scaled-up preview to compare against the source art) ──
export function toHtml({ w, h, px }, cell = 18) {
  let cells = "";
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const p = px[r][c];
    if (p) cells += `<i style="grid-row:${r + 1};grid-column:${c + 1};background:rgb(${p.r},${p.g},${p.b})"></i>`;
  }
  return `<div class="px" style="display:grid;grid-template-columns:repeat(${w},${cell}px);grid-template-rows:repeat(${h},${cell}px)">${cells}</div>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2] === "light" ? "light" : "dark";
  process.stdout.write("\n" + toAnsi(sprite(mode), "  ") + "\n");
  const panel = (bg, label, m) => `<div class="panel" style="background:${bg}"><div class="label">${label}</div>${toHtml(sprite(m))}</div>`;
  const html = `<!doctype html><meta charset="utf-8"><title>ul mini</title>
<style>body{margin:0;font:12px ui-sans-serif;background:#111;display:flex;flex-wrap:wrap}
.panel{padding:28px}.label{color:#888;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:14px}.px i{display:block}</style>
${panel("#1e1e1e", "dark — grey outline · white body · white wisps · black eyes", "dark")}${panel("#0d1117", "near-black — grey outline · white body · white wisps · black eyes", "dark")}${panel("#ffffff", "light — all cyan · black eyes", "light")}`;
  writeFileSync(fileURLToPath(new URL("../docs/ul-mini.html", import.meta.url)), html);
  process.stdout.write("  preview → docs/ul-mini.html\n\n");
}
