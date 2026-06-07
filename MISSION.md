# Mission: lifecycle demo — watch a whole ul life, top to bottom, in seconds

**Started:** 2026-06-07
**Branch:** claude/lifecycle-demo
**Parent:** main @ b0dc36b

## Goal
A single runnable command that plays an entire ul lifetime — birth → childhood → adolescence →
adulthood → old age → neglect-death — compressed into seconds, narrated, and **shown** (you see the
voice and the creature, not just numbers). This is the "see it actually work end to end" demo. It
must be **deterministic + offline** (scripted sessions through the engine, injected seed/clock — NO
real LLM/perception calls, NO API key, free + instant).

## What it must show, in order
1. **Birth** — seed → soul. Print the birth readout: sex, starting MBTI, temperament
   (clay/stubborn), the 10 aspects, set points. Render the **sprite** (the newborn ul) to the
   terminal in truecolor, and the **birth-stage voice** (what would be injected).
2. **The life** — drive a compressed lifetime via the simulator's `lifetime()` over a scripted
   session arc that spans all four stages. Narrate as it goes (reuse `tools/simulator/src/narrate.ts`):
   stage transitions, notable trait drift, set-point migration, **ruptures/breaking points**, and
   **atrophy** of unused sides.
3. **Checkpoints at each life stage** (child / adolescent / adult / old): print current MBTI + the
   handful of most-moved aspects, re-render the **sprite** (so you watch it visibly change with age),
   and the **stage-appropriate voice** — so the arc is legible as a *person changing*, not a table.
4. **Two lives, one seed (optional but great):** offer an `aligned` vs `mismatched-grind` arg so the
   user can run the same birth down two paths and see them diverge (clay reconfigures → one MBTI;
   stubborn hardens/resents → another). The SPEC acceptance contrast, made watchable.
5. **Neglect-death** — advance the injected clock past 90 days of non-use and show the ul die
   (clear, final readout).

## Make it a real "watch it" experience
- Pretty terminal output: clear stage banners, the sprite art inline, the voice block, compact stats.
- Pacing: small delays between beats are fine (it's a demo to watch) — but keep the underlying
  computation deterministic; a `--fast`/no-delay flag for CI/quick runs is a plus.
- One command to run it, documented in the README's Develop section (e.g. `pnpm demo` or
  `pnpm --filter <pkg> demo`, your call). Support an arg for aligned vs mismatched, and a seed arg.

## Placement / boundaries (decide cleanly, keep the guard green)
- Dev-only demo. It needs `core` (birth/stages/MBTI/consolidation), the simulator (`lifetime`,
  `narrate`), the `renderer` (voice + the pure sprite `SpriteParams`), and a **terminal sprite
  rasterizer**.
- The truecolor rasterizer currently lives in `packages/plugin/src/statusline` — but a dev tool
  importing `plugin` likely **breaks `pnpm check:boundaries`** (check the ALLOWED map). Resolve it
  cleanly: either reuse the self-contained sprite rasterization already in `scripts/ul-terminal.mjs`
  / `scripts/ul-sprite.mjs`, or add a small local rasterizer in the demo. Do NOT make `core`/
  `renderer` impure, and do NOT break the boundary guard.

## Out of scope
- Real LLM perception / the plugin hooks path (this is the engine+expression lifecycle, offline)
- Phase-5 registry/token; renderer/engine behavior changes (consume what exists)

## Definition of done
- One documented command runs the full narrated lifecycle with visible sprite + voice at each stage,
  deterministically, offline. `pnpm check` stays green (boundaries + lint + typecheck + tests).

## Status
Status: in-progress
