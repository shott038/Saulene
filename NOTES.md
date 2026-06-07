# viz-exploration — keepers vs scratch (read this first)

This worktree holds the ul's visual-identity prototype (Jun 5–6). Samuel has drawn a hard line
between what's REAL and what was just testing. Honor it.

> ⚠️ **CANONICAL SPRITE REMINDER — read before touching the look.** The REAL ul is the
> **pixel-art terminal sprite** (the truecolor half-block cloud-spirit: `scripts/ul-mini.mjs` +
> `scripts/ul-geometry.mjs` → formalized in `packages/renderer/src/sprite/` + the locked pixel
> bodies in `packages/plugin/src/statusline/sprite-data.ts`). The old **permanent purple "blob"
> variations** (early smooth/SVG-ish blobs that look like featureless purple clouds) were **scratch
> from testing only — NOT canonical. Do not ship, render, or revive them.** If anything is showing a
> purple blob instead of the pixel cloud-spirit, that's a regression — fix it back to the pixel sprite.

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

## ✅ REACTIVE ANIMATIONS — built Jun 6 (engine: scripts/ul-idle.mjs, preview: docs/ul-idle.html)
All composited per frame via `compose(wisps, overlay, dy)`. Each has a `--export-<name>` mode that
writes `docs/ul-<name>-frames.json`; `python3 scripts/_gif.py <frames.json> <out.gif>` renders it.
Preview them live, separated, at docs/ul-idle.html (each its own tile; breathing only in the
breathing/full-idle/ctx-high tiles).

DONE (8 + the >80% state):
- **Context window filling** — drops to down position, eyes off, top opens (`BODY_OPEN`): holds
  frame 2 while taking in, quick frame 1 to close, back to default. Keeps current wisps.
- **Context >80% default** (`BODY_CTXHIGH`) — "full" cloud (grey caps top+bottom); idle anims still
  play; the 2:15 variant swap is OFF while >80%.
- **User submits a prompt** — quick 1px hop: body up, wisps down (opposite), snap back.
- **Claude thinking** — wisps slide into the body (`win`) and vanish, held, then slide back out.
- **Big success** (`BODY_SUCCESS`) — up 1px into the white-cap "happy" sprite, hold, settle back.
- **Error** — fast jerk L→R→L→center, wisps blank for the whole shake.
- **Retry** — wisps vanish then reappear, once per retry.
- **Response finished** — wisps push out 1px both sides (`win:-1`), then back.
- **Context compaction** — EXCLUSIVE (suspends all else): eyes drop 1px, fast L·mid·R·mid scan,
  wisps gone.

NOT BUILT (deferred — Samuel called it done here): model/mode change · big file write/lots of output ·
permission prompt waiting · git commit/push.

compose() overlay flags: dx, dy, blink, eye (+eyeDy), wdy (wisp y), win (wisp in/out), open(1|2),
ctx, success, noWisps. Bodies: BODY, BODY_SUCCESS, BODY_CTXHIGH, BODY_OPEN[2].

## 🎛 CONFLICT RESOLUTION / DIRECTOR (the orchestration layer)
All animations share the same channels (body shape · dx/dy · eyes · wisps), so a director decides
what plays when triggers overlap. Two layers:
- MODES (sustained, exactly one, high→low): compaction > context-filling > thinking > ctx>80% rest > idle
- PULSES (one-shot, preempt by priority): error > success > prompt > retry > response
Rules: (1) compaction is EXCLUSIVE — suspends idle loop, pulses, gestures, swap, breathing until done;
(2) one mode at a time (filling beats thinking while context climbs; revert to thinking after);
(3) pulses preempt by priority, play to completion, then hand back to the mode; (4) idle gestures +
the 2:15 swap only run at rest (idle / >80%); (5) >80% governs only the resting body — transient
states use their own body then settle back.
Proof: `node scripts/ul-idle.mjs --export-session` → docs/ul-session.gif runs a full lifecycle
(prompt→thinking→filling→success→response→error→retry→COMPACTION→idle→>80%) with every overlap
resolved. This director is currently DEMO-only; the live player still uses ad-hoc idle logic — to
ship, promote the director to the runtime engine and drive it from the real hooks.

Combined preview of everything: docs/ul-all.html (sprite variations + all animations, one page).

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
