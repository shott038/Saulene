/**
 * build-ul-birth.mjs — the one-shot BIRTH animation that plays on first install.
 *
 * Watch-only (per SPEC): the user just watches their ul come into being. Choreography:
 *   1. gather   — wind wisps drift in from the sides
 *   2. condense — puffs grow from the central seed outward, assembling the cloud
 *   3. spark    — a soft pulse of life at the core
 *   4. wake     — the eyes open
 *   5. breath   — a first little breath, then it settles into its living idle loop
 *
 * Pure CSS, autoplay once, then idle loops forever. B&W (the ul's default look).
 *
 *   node scripts/build-ul-birth.mjs   →   docs/ul-birth.html
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WISPS, INK, BODY, EYES, ORIGIN, INK_COLOR, PAPER } from "./ul-geometry.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function birthSvg(uid, size = 440) {
  const inkPuffs = INK.map(([x, y, r], i) => `<circle class="p" style="--i:${i}" cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const bodyPuffs = BODY.map(([x, y, r], i) => `<circle class="p" style="--i:${i}" cx="${x}" cy="${y}" r="${r}"/>`).join("");
  const wisps = WISPS.map(([x1, x2, y, dir], i) => `<line style="--i:${i};--dir:${dir}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`).join("");
  const eyes = EYES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6"/>`).join("");

  const css = `
    @keyframes ${uid}-form{0%{opacity:0;transform:scale(.06)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}
    @keyframes ${uid}-gather{0%{opacity:0;transform:translateX(calc(var(--dir)*48px))}100%{opacity:.9;transform:translateX(0)}}
    @keyframes ${uid}-spark{0%{opacity:0;transform:scale(.2)}40%{opacity:.85}100%{opacity:0;transform:scale(2.8)}}
    @keyframes ${uid}-flush{0%,100%{fill:${PAPER}}45%{fill:#ffd7a0}}
    @keyframes ${uid}-eyeopen{0%{opacity:0;transform:scaleY(.05)}100%{opacity:1;transform:scaleY(1)}}
    @keyframes ${uid}-breath{0%{transform:scale(1)}35%{transform:scale(1.07)}100%{transform:scale(1)}}
    @keyframes ${uid}-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
    @keyframes ${uid}-blink{0%,90%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
    @keyframes ${uid}-drift{0%,100%{opacity:.9;transform:translateX(0)}50%{opacity:.4;transform:translateX(-3px)}}

    #${uid} .p{transform-box:fill-box;transform-origin:center;animation:${uid}-form .6s cubic-bezier(.2,1.3,.4,1) both;animation-delay:calc(.9s + var(--i)*.1s)}
    #${uid} .wisp line{transform-box:fill-box;animation:${uid}-gather .8s ease both, ${uid}-drift 3s ease-in-out infinite;animation-delay:calc(.2s + var(--i)*.08s), 3.9s}
    #${uid} .glow{transform-box:fill-box;transform-origin:${ORIGIN};animation:${uid}-spark 1.1s ease 1.9s both}
    #${uid} .body{animation:${uid}-flush 1.3s ease 1.9s 1}
    #${uid} .eyes{transform-box:fill-box;transform-origin:${ORIGIN};animation:${uid}-eyeopen .45s ease both, ${uid}-blink 5s ease-in-out infinite;animation-delay:2.6s, 4.6s}
    #${uid} .cloud{transform-box:fill-box;transform-origin:${ORIGIN};animation:${uid}-breath 1s ease both, ${uid}-float 3.6s ease-in-out infinite;animation-delay:2.7s, 4s}
    @media (prefers-reduced-motion:reduce){#${uid} *{animation-duration:.01s!important;animation-delay:0s!important}}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" id="${uid}" viewBox="0 0 300 200" width="${size}" height="${Math.round(size * 200 / 300)}" role="img" aria-label="an ul is born">
  <style>${css}</style>
  <defs><filter id="${uid}-b" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="11"/></filter></defs>
  <circle class="glow" cx="150" cy="108" r="42" fill="#ffce86" filter="url(#${uid}-b)"/>
  <g class="wisp" stroke="${INK_COLOR}" stroke-width="4" stroke-linecap="round">${wisps}</g>
  <g class="cloud">
    <g fill="${INK_COLOR}">${inkPuffs}</g>
    <g class="body" fill="${PAPER}">${bodyPuffs}</g>
    <g class="eyes" fill="${INK_COLOR}">${eyes}</g>
  </g>
</svg>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ul — birth</title>
<style>
  :root{--bg:#f3efe6;--ink:#2b2620;--muted:#9a9286;--line:#e7e0d3;--accent:#d97757;
    --serif:"Iowan Old Style",Palatino,Georgia,serif;--mono:"SF Mono",ui-monospace,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:radial-gradient(120% 90% at 50% 30%,#faf7f0,var(--bg));
    color:var(--ink);font-family:var(--serif);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
  h1{font-size:30px;margin:8px 0 0;letter-spacing:-.02em;font-weight:600}
  h1 .ul{color:var(--accent)}
  .sub{color:var(--muted);font-size:15px;margin:0;max-width:460px;text-align:center}
  .stage{background:#fbf8f2;border:1px solid var(--line);border-radius:24px;padding:10px;
    box-shadow:0 12px 40px rgba(120,90,60,.08)}
  .stage svg{display:block;border-radius:16px}
  .row{display:flex;gap:10px;align-items:center;font-family:var(--mono);font-size:12px;color:var(--muted)}
  button{font-family:var(--mono);font-size:13px;background:var(--accent);color:#fff;border:0;
    padding:9px 18px;border-radius:10px;cursor:pointer;letter-spacing:.03em}
  button:hover{background:#c8623f}
  .phases{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.04em}
</style></head><body>
  <h1>an <span class="ul">ul</span> is born</h1>
  <p class="sub">Watch-only. On first install, this plays once — then the ul lives.</p>
  <div class="stage" id="stage">${birthSvg("birth")}</div>
  <div class="row"><button id="replay">↻ replay</button>
    <span class="phases">gather → condense → spark → wake → first breath → idle</span></div>
<script>
  const stage = document.getElementById('stage');
  const original = stage.firstElementChild;
  document.getElementById('replay').addEventListener('click', () => {
    const fresh = original.cloneNode(true);
    stage.replaceChild(fresh, stage.firstElementChild);
  });
</script>
</body></html>`;

const out = resolve(root, "docs/ul-birth.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log("wrote", out, "(" + html.length + " bytes)");
