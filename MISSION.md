# Mission: lifecycle visualizer — a whole ul life, on one beautiful web page

**Started:** 2026-06-07
**Branch:** claude/lifecycle-visualizer
**Parent:** main @ a7058e8

## Goal
The `pnpm demo` plays a life in the terminal, but it can't be *seen* outside a TTY. Build a generator
that runs the same deterministic lifecycle and emits a **self-contained HTML file** that visualizes a
ul's whole life — birth → childhood → adolescence → early adulthood → old adulthood → neglect-death —
on one page, beautifully. This is the thing Samuel opens in a browser to actually watch a life.

## What the page must show
1. **The cloud sprite at each life stage, IN COLOR** — a row/timeline of the creature at birth +
   each stage + death, so you watch it visibly change (hue/size/shape) as it ages. Render the sprite
   faithfully (it's a pixel grid of RGB cells → draw as inline SVG/canvas squares; reuse how
   `tools/demo` already rasterizes the sprite so you DON'T need to import `plugin`).
2. **Aspect-drift chart** — the 10 aspects over the lifespan (x = sessions/MP, y = 0–1), lines rising
   and atrophying across the life, with **rupture/breaking-point markers** and stage bands shaded.
3. **Birth & death readouts** — header: sex, birth MBTI, temperament (clay/stubborn), top leanings.
   Footer: final MBTI (with "identity held" vs "flipped to X"), # breaks, sessions, final MP.
4. **MBTI / stage track** along the timeline.

## How to build it
- A generator in `tools/` (extend `tools/demo` with an HTML-emit mode, e.g. `pnpm demo:html`, or a
  small sibling tool). Reuse the demo's existing lifecycle computation + sprite rasterization.
- **Self-contained HTML** — inline CSS + inline SVG/canvas, NO external CDN/network deps (so it opens
  anywhere and screenshots cleanly). Vanilla JS/SVG is fine; make it *look* good (this is the visual
  payoff — use the frontend-design skill for polish: type, spacing, a dark elegant backdrop that
  makes the colored clouds pop).
- **Deterministic; args:** `--seed N` and `--mode aligned|mismatched|both`. For `both`, show the two
  lives side by side so the same-seed divergence (clay crystallizes vs stubborn ruptures + MBTI flip)
  is visible. Write to a predictable path (e.g. `tools/demo/out/lifecycle.html`) and print the path.
- Keep `core`/`renderer` pure; this is dev tooling. `pnpm check:boundaries` stays green (don't import
  `plugin`). `pnpm check` green.

## Reuse / provenance
This is effectively a prototype of the future gallery's "ul detail page" — build the sprite→SVG and
the drift-chart rendering so they could be lifted to the website later. Note that in
`tools/demo/NOTES` or a comment.

## Out of scope
- The actual gallery website / registry wiring (separate track), interactivity beyond static render
  is optional, real LLM anything.

## Definition of done
- One command emits a self-contained, good-looking HTML visualizing a full lifecycle (colored sprites
  per stage + drift chart + ruptures + birth/death readouts), deterministic, `--seed`/`--mode` args.
  `pnpm check` green. Tell me the exact command + output path so I can open/screenshot it.

## Key files
- `tools/demo/src/html.ts` — the generator (entry point for `pnpm demo:html`)
- `tools/demo/out/lifecycle.html` — example output (seed 42, mode both)
- `package.json` — added `demo:html` script

## Verification
- Build: pass
- Tests: pass (347 passed)
- Scope kept: yes — no plugin imports, boundaries clean
- Summary: `pnpm demo:html [--seed N] [--mode aligned|mismatched|both]` emits a self-contained dark HTML page with pixel-art sprite timeline, 10-aspect SVG drift chart with rupture markers + stage bands, MBTI track, birth/death readouts; both mode shows divergence table

## Status
Status: ready-to-merge
