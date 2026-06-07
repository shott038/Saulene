/**
 * ul-terminal.mjs — render the locked ul cloud as a TERMINAL sprite.
 *
 * The Claude Code statusline can't draw SVG, but it CAN print 24-bit-color Unicode
 * half-blocks (▀). So we rasterize the cloud geometry into a small pixel grid, then emit:
 *   - toAnsi(grid)  → a truecolor half-block string for a real terminal / statusline
 *   - toHtml(grid)  → an identical pixel grid in HTML (for visual verification)
 *
 * Two vertical pixels pack into one character cell via ▀ (fg = top pixel, bg = bottom).
 * State frames (idle / blink / success / stress) change eyes + color, the way a statusline
 * mascot would react to session events (e.g. context-pressure goes red, à la Clawd).
 */
import { BODY, EYES, INK, WISPS } from "./ul-geometry.mjs";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

export function hslRgb(h, s, l) {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

export const PALS = {
  cumulus: hslRgb(40, 8, 96),
  storm: hslRgb(215, 8, 70),
  sky: hslRgb(205, 70, 73),
  mint: hslRgb(150, 45, 72),
  gold: hslRgb(45, 78, 70),
  ember: hslRgb(20, 75, 66),
  rose: hslRgb(345, 70, 76),
  dusk: hslRgb(258, 45, 72),
};

const INKC = { r: 22, g: 19, b: 16 };
const GOLD = { r: 255, g: 211, b: 107 };
const RED = { r: 226, g: 86, b: 70 };

// crop window around the cloud (incl. the inner wind wisps)
const X0 = 58;
const X1 = 242;
const Y0 = 40;
const Y1 = 162;

const inAny = (circles, sx, sy) =>
  circles.some(([cx, cy, r]) => (sx - cx) ** 2 + (sy - cy) ** 2 <= r * r);
function nearWisp(sx, sy, tol) {
  return WISPS.some(([x1, x2, y]) => Math.abs(sy - y) <= tol && sx >= x1 - tol && sx <= x2 + tol);
}

/**
 * Rasterize one frame. state ∈ idle | blink | success | stress.
 * Returns { w, h, px } where px[row][col] is {r,g,b} or null (transparent).
 */
export function rasterize(state = "idle", palRgb = PALS.sky, cols = 30) {
  const ps = (X1 - X0) / cols;
  const rows = Math.round((Y1 - Y0) / ps);
  const er = ps * 0.6 + 1.6; // eye radius in svg units (~1-2 px)

  let body = palRgb;
  if (state === "success") body = mix(body, { r: 255, g: 255, b: 255 }, 0.14);
  if (state === "stress") body = mix(body, RED, 0.62);

  const eyeDY = state === "success" ? -4 : state === "stress" ? 2 : 0;
  const showEyes = state !== "blink";
  const sparkles =
    state === "success"
      ? [
          [122, 52],
          [150, 45],
          [180, 55],
        ]
      : [];

  const px = [];
  for (let r = 0; r < rows; r++) {
    const sy = Y0 + (r + 0.5) * ps;
    const line = [];
    for (let c = 0; c < cols; c++) {
      const sx = X0 + (c + 0.5) * ps;
      let col = null;
      if (sparkles.some(([x, y]) => (sx - x) ** 2 + (sy - y) ** 2 <= 9)) col = GOLD;
      else if (
        showEyes &&
        EYES.some(([ex, ey]) => (sx - ex) ** 2 + (sy - (ey + eyeDY)) ** 2 <= er * er)
      )
        col = INKC;
      else if (inAny(BODY, sx, sy)) col = body;
      else if (inAny(INK, sx, sy))
        col = INKC; // outline ring
      else if (nearWisp(sx, sy, ps * 0.5)) col = INKC; // wind wisps
      line.push(col);
    }
    px.push(line);
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

// ── HTML (verification preview; 1 div per pixel = identical to the terminal look) ──
export function toHtml(grid, cell = 7) {
  const { w, h, px } = grid;
  let cells = "";
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const p = px[r][c];
      cells += p
        ? `<i style="grid-row:${r + 1};grid-column:${c + 1};background:rgb(${p.r},${p.g},${p.b})"></i>`
        : "";
    }
  return `<div class="px" style="display:grid;grid-template-columns:repeat(${w},${cell}px);grid-template-rows:repeat(${h},${cell}px)">${cells}</div>`;
}
