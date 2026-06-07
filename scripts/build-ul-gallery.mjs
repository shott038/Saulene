/**
 * build-ul-gallery.mjs
 *
 * The ul mascot is a locked B&W cloud-spirit (docs/ul-default.svg). This renders it in a
 * bunch of color PALETTES and several ANIMATION styles into one self-contained gallery.
 *
 * Geometry is defined once here; palettes only swap fills, animations only add CSS. The
 * two-layer build (ink silhouette under, body layer on top) means any body color works
 * while the outline stays crisp.
 *
 *   node scripts/build-ul-gallery.mjs   →   docs/ul-gallery.html
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BODY, EYES, INK, ORIGIN, WISPS } from "./ul-geometry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── palettes ──────────────────────────────────────────────────────────────────
const ink = "#161310";
const light = "#f4f1ea";
const P = (name, body, opts = {}) => ({
  name,
  body,
  outline: opts.outline ?? ink,
  eye: opts.eye ?? (opts.dark ? light : ink),
  wisp: opts.wisp ?? (opts.dark ? "#6b7488" : ink),
  bg: opts.bg ?? "#efeae0",
});
const PALETTES = [
  P("Cumulus", "#ffffff"),
  P("Storm", "#c2c7cf"),
  P("Slate", "#8e99a8"),
  P("Sky", "#bfe1f6"),
  P("Sea", "#9fd6cf"),
  P("Mint", "#b9e7d0"),
  P("Gold", "#f4d57e"),
  P("Peach", "#f7c8a3"),
  P("Ember", "#f0a079"),
  P("Rose", "#f4b9c7"),
  P("Lilac", "#dcc6f0"),
  P("Dusk", "#bcaee6"),
  P("Midnight", "#3a4252", { dark: true, bg: "#e7e2d9" }),
  P("Ink", "#1d1b17", { dark: true, outline: "#000000", wisp: "#564f45", bg: "#e7e2d9" }),
];

// ── animations ────────────────────────────────────────────────────────────────
// each entry returns the CSS rules for a given uid. all keep the wisps drifting (ambient).
const ANIMS = {
  idle: { label: "Idle", motion: "float", dur: 3.6, blink: true },
  breathe: { label: "Breathe", motion: "breathe", dur: 3.4, blink: false },
  sway: { label: "Sway", motion: "sway", dur: 4.0, blink: false },
  bob: { label: "Bob", motion: "bob", dur: 2.6, blink: false },
  bounce: { label: "Bounce", motion: "bounce", dur: 1.9, blink: false },
  blink: { label: "Blink", motion: "none", dur: 0, blink: true },
};

function keyframes(uid) {
  return `
    @keyframes ${uid}-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes ${uid}-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
    @keyframes ${uid}-sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
    @keyframes ${uid}-bob{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-4px) rotate(1.5deg)}}
    @keyframes ${uid}-bounce{0%,100%{transform:translateY(0)}25%{transform:translateY(-11px)}40%{transform:translateY(0)}55%{transform:translateY(-4px)}70%{transform:translateY(0)}}
    @keyframes ${uid}-blink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
    @keyframes ${uid}-drift{0%,100%{opacity:.9;transform:translateX(0)}50%{opacity:.35;transform:translateX(-3px)}}`;
}

function cloudSvg(pal, animKey, uid, size = 170) {
  const a = ANIMS[animKey];
  const inkPuffs = INK.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const bodyPuffs = BODY.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const wisps = WISPS.map(
    ([x1, x2, y], i) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" style="--i:${i}"/>`,
  ).join("");
  const eyes = EYES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join("");

  const motionCss =
    a.motion === "none"
      ? ""
      : `#${uid} .cloud{transform-origin:${ORIGIN};transform-box:fill-box;animation:${uid}-${a.motion} ${a.dur}s ease-in-out infinite}`;
  const blinkCss = a.blink
    ? `#${uid} .eyes{transform-origin:${ORIGIN};transform-box:fill-box;animation:${uid}-blink 5s ease-in-out infinite}`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" id="${uid}" viewBox="0 0 300 200" width="${size}" height="${Math.round((size * 200) / 300)}" role="img" aria-label="ul — ${pal.name}">
  <style>${keyframes(uid)}
    #${uid} .wisp line{transform-box:fill-box;animation:${uid}-drift 3s ease-in-out infinite;animation-delay:calc(var(--i) * .18s)}
    ${motionCss}
    ${blinkCss}
    @media (prefers-reduced-motion:reduce){#${uid} *{animation:none!important}}
  </style>
  <rect width="300" height="200" rx="18" fill="${pal.bg}"/>
  <g class="wisp" stroke="${pal.wisp}" stroke-width="4" stroke-linecap="round">${wisps}</g>
  <g class="cloud">
    <g fill="${pal.outline}">${inkPuffs}</g>
    <g fill="${pal.body}">${bodyPuffs}</g>
    <g class="eyes" fill="${pal.eye}">${eyes}</g>
  </g>
</svg>`;
}

// ── page ────────────────────────────────────────────────────────────────────
let uidN = 0;
const uid = () => `u${(uidN++).toString(36)}`;

const palCards = PALETTES.map((p) => {
  return `<figure class="card"><div class="art">${cloudSvg(p, "idle", uid(), 180)}</div>
    <figcaption><strong>${p.name}</strong><span class="sw" style="background:${p.body}"></span></figcaption></figure>`;
}).join("");

const animCards = Object.entries(ANIMS)
  .map(([k, a]) => {
    return `<figure class="card"><div class="art">${cloudSvg(PALETTES[0], k, uid(), 180)}</div>
    <figcaption><strong>${a.label}</strong></figcaption></figure>`;
  })
  .join("");

// a few palettes shown across the animation set (palette × animation matrix, small)
const matrixPals = ["Sky", "Ember", "Dusk", "Midnight"].map((n) =>
  PALETTES.find((p) => p.name === n),
);
const matrix = matrixPals
  .map((p) =>
    Object.keys(ANIMS)
      .map((k) => `<div class="cell">${cloudSvg(p, k, uid(), 120)}</div>`)
      .join(""),
  )
  .join("");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ul — palettes & animations</title>
<style>
  :root{--bg:#f3efe6;--ink:#2b2620;--muted:#9a9286;--line:#e7e0d3;--accent:#d97757;
    --serif:"Iowan Old Style",Palatino,Georgia,serif;--mono:"SF Mono",ui-monospace,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.5;-webkit-font-smoothing:antialiased}
  header{max-width:1120px;margin:0 auto;padding:48px 28px 8px;text-align:center}
  h1{font-size:34px;margin:0 0 6px;letter-spacing:-.02em}
  .sub{color:var(--muted);font-size:16px;max-width:560px;margin:0 auto}
  h2{max-width:1120px;margin:34px auto 14px;padding:0 28px;font-family:var(--mono);font-size:12px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  section{max-width:1120px;margin:0 auto;padding:0 28px}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
  .card{margin:0;background:#fbf8f2;border:1px solid var(--line);border-radius:16px;overflow:hidden;
    display:flex;flex-direction:column;align-items:center;box-shadow:0 6px 18px rgba(120,90,60,.05)}
  .art{padding:10px 10px 2px}
  .art svg{display:block;border-radius:12px}
  figcaption{display:flex;align-items:center;gap:8px;justify-content:center;padding:8px 0 14px;width:100%}
  figcaption strong{font-size:15px;font-weight:600}
  .sw{width:12px;height:12px;border-radius:50%;border:1px solid rgba(0,0,0,.15)}
  .matrix{max-width:1120px;margin:0 auto 60px;padding:0 28px;display:grid;gap:8px;
    grid-template-columns:repeat(6,1fr)}
  .cell{background:#fbf8f2;border:1px solid var(--line);border-radius:12px;display:flex;justify-content:center;padding:6px}
  .cell svg{display:block;border-radius:8px}
  footer{max-width:1120px;margin:0 auto;padding:0 28px 60px;color:var(--muted);font-family:var(--mono);font-size:12px}
</style></head><body>
<header>
  <h1>the <span style="color:var(--accent)">ul</span> — palettes &amp; animations</h1>
  <p class="sub">One locked cloud-spirit, recolored and brought to life. The outline stays ink; only the body fill swaps. Every card is animated.</p>
</header>

<h2>Palettes <span style="color:var(--line)">·</span> ${PALETTES.length} variants (idle animation)</h2>
<section><div class="grid">${palCards}</div></section>

<h2>Animations <span style="color:var(--line)">·</span> default palette</h2>
<section><div class="grid">${animCards}</div></section>

<h2>Palette × animation</h2>
<div class="matrix">${matrix}</div>

<footer>Geometry locked in docs/ul-default.svg · regenerate: node scripts/build-ul-gallery.mjs</footer>
</body></html>`;

const out = resolve(root, "docs/ul-gallery.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(
  "wrote",
  out,
  `(${html.length} bytes,`,
  PALETTES.length,
  "palettes,",
  Object.keys(ANIMS).length,
  "animations)",
);
