/**
 * build-ul-types.mjs — a large board of ul sprites, each LIGHTLY unique to its personality
 * set points (the innate nature `s`). Same cloud-spirit, gently individualized:
 *
 *   - body proportions  ← assertiveness (taller) · clay/stubbornness (wider)
 *   - bumpiness/jitter   ← orderliness (tidy vs slightly lopsided puffs)
 *   - eye spacing/height ← assertiveness · withdrawal (downcast)
 *   - tilt               ← volatility + birth entropy
 *   - wisp count         ← enthusiasm (2 vs 3 per side)
 *   - soft body color    ← openness·intellect (terracotta S → violet N), industriousness = saturation
 *
 * Variation is deliberately small — every sprite still reads as the one locked ul.
 *
 *   node scripts/build-ul-types.mjs   →   docs/ul-types.html
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WISPS, INK, BODY, EYES, INK_COLOR } from "./ul-geometry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const CX = 150, CY = 108;

function rng32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seedOf(v, stub) { let h = 2166136261 >>> 0; const push = (n) => { const x = Math.floor(clamp01(n) * 65535); h = Math.imul(h ^ (x & 255), 16777619) >>> 0; h = Math.imul(h ^ (x >>> 8), 16777619) >>> 0; }; for (const k of Object.keys(v)) push(v[k]); push(stub); return h >>> 0; }

// warm terracotta → violet ember ramp (never green/cyan)
const HUES = [34, 22, 10, 352, 326, 290];
function hue(t) { const x = clamp01(t) * (HUES.length - 1); const i = Math.min(HUES.length - 2, Math.floor(x)); const f = x - i; let a = HUES[i], b = HUES[i + 1]; if (Math.abs(b - a) > 180) { if (b > a) a += 360; else b += 360; } return (lerp(a, b, f) + 360) % 360; }

function mbti(v) {
  return (v.enthusiasm + v.assertiveness >= 1 ? "E" : "I") +
    (v.openness + v.intellect >= 1.18 ? "N" : "S") +
    (v.compassion >= v.politeness ? "F" : "T") +
    (v.industriousness + v.orderliness >= 1 ? "J" : "P");
}

// per-puff region: 0=center, 1&5=sides, 2/3/4=upper crown, 6/7/8=lower base
const TOP = new Set([2, 3, 4]), BOT = new Set([6, 7, 8]);

function renderUl(v, stub, size = 130, bg = "#fbf8f2") {
  const seed = seedOf(v, stub);
  const rng = rng32(seed);
  const clay = 1 - clamp01(stub);
  const wx = lerp(0.86, 1.16, clay);
  const hy = lerp(0.86, 1.22, clamp01(v.assertiveness));
  const sr = 0.5 * wx + 0.5 * hy;
  const jit = lerp(0, 4.4, 1 - clamp01(v.orderliness));
  const tilt = (rng() - 0.5) * lerp(4, 17, clamp01(v.volatility));
  const topB = lerp(0.85, 1.2, clamp01(v.openness));   // fluffier crown when open
  const botB = lerp(0.9, 1.16, clay);                  // heavier base when clay
  const fac = (i) => (TOP.has(i) ? topB : BOT.has(i) ? botB : 1);

  // transform each puff position once (shared by ink + body layers)
  const pos = INK.map(([x, y]) => ({
    x: CX + (x - CX) * wx + (rng() - 0.5) * 2 * jit,
    y: CY + (y - CY) * hy + (rng() - 0.5) * 2 * jit,
  }));
  const circ = (arr) => arr.map(([, , r], i) => `<circle cx="${pos[i].x.toFixed(1)}" cy="${pos[i].y.toFixed(1)}" r="${(r * sr * fac(i)).toFixed(1)}"/>`).join("");

  // eyes follow the body; spacing + size + height shift with personality
  const gapF = lerp(0.76, 1.28, clamp01(v.assertiveness));
  const eyeR = lerp(2.6, 4.7, clamp01(v.openness));
  const eyeY = CY + (108 - CY) * hy + lerp(-2, 6.5, clamp01(v.withdrawal));
  const eyes = EYES.map(([x]) => `<circle cx="${(CX + (x - CX) * wx * gapF).toFixed(1)}" cy="${eyeY.toFixed(1)}" r="${eyeR.toFixed(1)}"/>`).join("");

  // wisps: 3 per side when lively, else 2; length grows with enthusiasm
  const keep = clamp01(v.enthusiasm) > 0.45 ? [0, 1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const le = lerp(0.7, 1.5, clamp01(v.enthusiasm));
  const wisps = WISPS.filter((_, i) => keep.includes(i)).map(([x1, x2, y]) => {
    const c = (x1 + x2) / 2, hl = (x2 - x1) / 2 * le;
    return `<line x1="${(c - hl).toFixed(1)}" y1="${y}" x2="${(c + hl).toFixed(1)}" y2="${y}"/>`;
  }).join("");

  const h = hue(clamp01(0.62 * v.openness + 0.38 * v.intellect));
  const s = lerp(45, 90, clamp01(0.5 * v.industriousness + 0.5 * v.enthusiasm));
  const l = lerp(82, 60, clamp01(0.62 * v.openness + 0.38 * v.intellect));
  const body = `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="${size}" height="${Math.round(size * 200 / 300)}">
  <rect width="300" height="200" rx="16" fill="${bg}"/>
  <g transform="rotate(${tilt.toFixed(2)} ${CX} 110)">
    <g stroke="${INK_COLOR}" stroke-width="4" stroke-linecap="round">${wisps}</g>
    <g fill="${INK_COLOR}">${circ(INK)}</g>
    <g fill="${body}">${circ(BODY)}</g>
    <g fill="${INK_COLOR}">${eyes}</g>
  </g>
</svg>`;
}

// ── the 16 MBTI types (canonical set points) ──────────────────────────────────
const TYPES = [];
for (const t of ["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"]) {
  const E = t[0] === "E", N = t[1] === "N", F = t[2] === "F", J = t[3] === "J";
  const r = rng32(t.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0);
  const v = {
    openness: N ? 0.82 : 0.32, intellect: N ? 0.78 : 0.34,
    industriousness: J ? 0.72 : 0.34, orderliness: J ? 0.72 : 0.34,
    enthusiasm: E ? 0.74 : 0.3, assertiveness: E ? 0.7 : 0.32,
    compassion: F ? 0.8 : 0.4, politeness: F ? 0.5 : 0.72,
    withdrawal: 0.4 + r() * 0.2, volatility: 0.35 + r() * 0.3,
  };
  TYPES.push({ label: t, v, stub: 0.25 + r() * 0.6 });
}

// ── a larger sampled population (research distribution) ────────────────────────
const ASPECTS = Object.keys(TYPES[0].v);
const SIGMA = { openness: .14, intellect: .14, industriousness: .11, orderliness: .12, enthusiasm: .14, assertiveness: .11, compassion: .17, politeness: .16, withdrawal: .16, volatility: .15 };
const D = { openness: .27, intellect: -.22, industriousness: .06, orderliness: .18, enthusiasm: .23, assertiveness: -.09, compassion: .45, politeness: .36, withdrawal: .40, volatility: .30 };
function gauss(rng) { let u = 0, w = 0; while (u === 0) u = rng(); while (w === 0) w = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w); }
const popRng = rng32(0xC0FFEE);
const POP = [];
for (let i = 0; i < 48; i++) {
  const female = popRng() < 0.5;
  const sgn = female ? 1 : -1;
  const v = {};
  for (const a of ASPECTS) v[a] = clamp01(0.5 + sgn * 0.5 * D[a] + gauss(popRng) * SIGMA[a]);
  POP.push({ v, stub: popRng(), sex: female ? "♀" : "♂" });
}

// ── page ────────────────────────────────────────────────────────────────────
const typeCards = TYPES.map((t) =>
  `<figure class="card">${renderUl(t.v, t.stub, 150)}<figcaption><strong>${t.label}</strong></figcaption></figure>`).join("");
const popCards = POP.map((p) =>
  `<figure class="card sm">${renderUl(p.v, p.stub, 116)}<figcaption>${mbti(p.v)} <span class="sex">${p.sex}</span></figcaption></figure>`).join("");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>ul — types</title>
<style>
  :root{--bg:#f3efe6;--ink:#2b2620;--muted:#9a9286;--line:#e7e0d3;--accent:#d97757;
    --serif:"Iowan Old Style",Palatino,Georgia,serif;--mono:"SF Mono",ui-monospace,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.5;-webkit-font-smoothing:antialiased}
  header{max-width:1180px;margin:0 auto;padding:46px 28px 6px;text-align:center}
  h1{font-size:33px;margin:0 0 6px;letter-spacing:-.02em}.ul{color:var(--accent)}
  .sub{color:var(--muted);font-size:15.5px;max-width:600px;margin:0 auto}
  h2{max-width:1180px;margin:30px auto 14px;padding:0 28px;font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  section{max-width:1180px;margin:0 auto;padding:0 28px 12px}
  .grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .grid.pop{grid-template-columns:repeat(auto-fill,minmax(116px,1fr))}
  .card{margin:0;background:#fbf8f2;border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding-bottom:6px;box-shadow:0 5px 14px rgba(120,90,60,.04)}
  .card svg{display:block}
  figcaption{font-family:var(--mono);font-size:12px;color:#6f685c;padding-top:2px}
  .card.sm figcaption{font-size:11px}
  .sex{color:#b08968}
  footer{max-width:1180px;margin:0 auto;padding:18px 28px 60px;color:var(--muted);font-family:var(--mono);font-size:11.5px}
</style></head><body>
<header>
  <h1>the <span class="ul">ul</span> — lightly unique by type</h1>
  <p class="sub">One cloud-spirit, gently individualized by its innate set points. Cool/violet = intuitive (N), warm terracotta = sensing (S); proportions, tilt, bumpiness, eyes &amp; wisps all nudge with the personality. Same ul, its own self.</p>
</header>
<h2>The 16 types</h2>
<section><div class="grid">${typeCards}</div></section>
<h2>A population — 48 born from the research distribution</h2>
<section><div class="grid pop">${popCards}</div></section>
<footer>Geometry: docs/ul-default.svg · variation is intentionally subtle · regenerate: node scripts/build-ul-types.mjs</footer>
</body></html>`;

const out = resolve(root, "docs/ul-types.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log("wrote", out, "(" + html.length + " bytes, 16 types + " + POP.length + " population)");
