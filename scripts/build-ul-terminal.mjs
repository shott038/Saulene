/**
 * build-ul-terminal.mjs → docs/ul-terminal.html
 * Visual proof of the terminal sprite: state frames, palettes, and a mock statusline.
 * The HTML renders one div per pixel, which is exactly what the ANSI half-blocks show.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rasterize, toHtml, PALS } from "./ul-terminal.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HERO = 34, MINI = 18;

const states = ["idle", "blink", "success", "stress"];
const stateCards = states.map((s) =>
  `<figure class="card dark">${toHtml(rasterize(s, PALS.sky, HERO), 6)}<figcaption>${s}</figcaption></figure>`).join("");

const palCards = Object.entries(PALS).map(([n, c]) =>
  `<figure class="card dark">${toHtml(rasterize("idle", c, HERO), 6)}<figcaption>${n}</figcaption></figure>`).join("");

// mock statusline rows: sprite (mini) beside terminal-ish text
function statusline(label, state, pal, lines) {
  return `<div class="term">
    <div class="sl">${toHtml(rasterize(state, pal, MINI), 5)}</div>
    <div class="sltext">${lines.map((l) => `<div>${l}</div>`).join("")}</div>
    <span class="sltag">${label}</span>
  </div>`;
}
const slIdle = statusline("idle", "idle", PALS.sky, ["<b>saulene</b> · INTJ ul", "~/project  ⎇ main  ctx&nbsp;32%"]);
const slBusy = statusline("tool success", "success", PALS.mint, ["<b>saulene</b> · INTJ ul ✓", "~/project  ⎇ main  ctx&nbsp;41%"]);
const slStress = statusline("context stress", "stress", PALS.ember, ["<b>saulene</b> · INTJ ul", "~/project  ⎇ main  <span style='color:#e2584a'>ctx&nbsp;91%</span>"]);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/><title>ul — terminal sprite</title>
<style>
  :root{--bg:#f3efe6;--ink:#2b2620;--muted:#9a9286;--line:#e7e0d3;--accent:#d97757;--term:#16161d;
    --serif:"Iowan Old Style",Palatino,Georgia,serif;--mono:"SF Mono",ui-monospace,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);line-height:1.5}
  header{max-width:1060px;margin:0 auto;padding:46px 28px 4px;text-align:center}
  h1{font-size:31px;margin:0 0 6px}.ul{color:var(--accent)}
  .sub{color:var(--muted);font-size:15px;max-width:600px;margin:0 auto}
  h2{max-width:1060px;margin:30px auto 12px;padding:0 28px;font-family:var(--mono);font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  section{max-width:1060px;margin:0 auto;padding:0 28px}
  .grid{display:flex;flex-wrap:wrap;gap:14px}
  .card{margin:0;border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px;background:#fbf8f2}
  .card.dark{background:var(--term);border-color:#000}
  .card .px{image-rendering:pixelated}
  figcaption{font-family:var(--mono);font-size:11px;color:#bdb6a8}
  .card:not(.dark) figcaption{color:#6f685c}
  .terms{max-width:1060px;margin:0 auto;padding:0 28px;display:flex;flex-direction:column;gap:12px}
  .term{background:var(--term);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:16px;position:relative;box-shadow:0 8px 22px rgba(0,0,0,.12)}
  .term .px{image-rendering:pixelated}
  .sltext{font-family:var(--mono);font-size:13px;color:#cfd4dc;line-height:1.45}
  .sltext b{color:#fff}
  .sltag{position:absolute;right:14px;top:10px;font-family:var(--mono);font-size:10px;color:#6b7280;letter-spacing:.08em;text-transform:uppercase}
  footer{max-width:1060px;margin:0 auto;padding:24px 28px 60px;color:var(--muted);font-family:var(--mono);font-size:11.5px}
  footer code{background:#efe9dc;padding:1px 6px;border-radius:5px}
</style></head><body>
<header>
  <h1>the <span class="ul">ul</span> in the terminal</h1>
  <p class="sub">The locked cloud rasterized to 24-bit half-block pixels — exactly what a Claude Code statusline can print. Each pixel here is one div; in the terminal two stack into one ▀ cell.</p>
</header>

<h2>State frames — how it reacts</h2>
<section><div class="grid">${stateCards}</div></section>

<h2>Palettes (per-ul color)</h2>
<section><div class="grid">${palCards}</div></section>

<h2>In a statusline</h2>
<div class="terms">${slIdle}${slBusy}${slStress}</div>

<footer>Run it in your real terminal: <code>node scripts/ul-sprite.mjs</code> · engine: scripts/ul-terminal.mjs</footer>
</body></html>`;

const out = resolve(root, "docs/ul-terminal.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log("wrote", out);
