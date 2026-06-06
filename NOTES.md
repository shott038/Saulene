# viz-exploration — keepers vs scratch (read this first)

This worktree holds the ul's visual-identity prototype (Jun 5–6). Samuel has drawn a hard line
between what's REAL and what was just testing. Honor it.

## ⭐ BASE DEFAULT KIT — the locked terminal ul (Jun 6)
The cyan in-terminal ul that sits in a user's session. This is the base everything builds off of.
Two color modes: light terminal = all cyan + black eyes; dark terminal = grey body outline,
white body fill, white wisps, black eyes. Sprite is ~13px wide, rendered as truecolor half-blocks.

- `scripts/ul-mini.mjs` — the canonical mini sprite (pixel-perfect from Samuel's pixil art).
- `scripts/ul-wisps.mjs` — the wisp-variant gallery. **8 IDLE variants** (core default):
  the 5 "originals" (original / short-top / short-bottom / clip-top-right / clip-top-left),
  plus two-stubs, minimal, baby-clouds. Plus REACTIVE-STATE wisps (windswept, drizzle, steam,
  comet, wings, twinkle, lightning, heavy-rain, snow, tornado) — not yet wired to events.
- `scripts/ul-idle.mjs` — **idle animation engine** (the heart of the kit). Live terminal player +
  GIF export. Baseline breathing (body bobs, wisps stay), random gestures (blink, double-blink,
  look L/R, sway L/R), and a variant swap every **2:15** rolling 15% × each of the 5 originals,
  13% two-stubs, 8% baby-clouds, 4% minimal (=100%).
- `scripts/_gif.py` — builds `docs/ul-idle.gif` from the exported frames.
- Previews: `docs/ul-idle.html` (separated animations, live), `docs/ul-wisps.html`, `docs/ul-mini.html`.

Run: `node scripts/ul-idle.mjs` (live, Ctrl-C to stop) · `node scripts/ul-idle.mjs --export` then
`python3 scripts/_gif.py` (rebuild the GIF).

## ✅ KEEPERS — these are the real, locked visuals
- **The default ul look** — the locked cloud-spirit geometry.
  - `scripts/ul-geometry.mjs` — the canonical geometry (puffs, eyes, ink/body). **Source of truth.**
  - `docs/ul-default.svg` — the rendered default look.
- **The birth animation** — plays on first install ("watch it be born"). The cloud grows puff-by-puff,
  center → upper ring → lower ring.
  - `scripts/build-ul-birth.mjs` — the generator.
  - `docs/ul-birth.html` — the animation.

## 🗑 SCRATCH — just testing/exploration, NOT canonical (don't treat as design truth)
- `scripts/build-ul-types.mjs` + `docs/ul-types.html` — personality-individualized sprite board (test).
- `scripts/build-ul-gallery.mjs` + `docs/ul-gallery.html` — palette/animation gallery (test).
- `scripts/build-ul-terminal.mjs` + `scripts/ul-terminal.mjs` + `scripts/ul-sprite.mjs`
  + `docs/ul-terminal.html` — terminal-sprite experiment (test).
- `docs/ul-cloud.svg` — an alternate/variant of the default (test).

## How to work here
Samuel will drive this session live — wait for his direction, don't autonomously refactor.
Likely directions: refine the birth animation / default look, or formalize the two keepers into the
real renderer (`packages/renderer/src/sprite/index.ts` is an empty stub for the engine's
`state → look` surface). The keepers above are the design truth; the scratch files can be deleted or
ignored when the time comes.
