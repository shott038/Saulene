# Mission: plugin/statusline — the live terminal ul

**Started:** 2026-06-06
**Branch:** claude/plugin-statusline
**Parent:** main @ e599141

## Goal
Make the ul actually visible in the user's terminal. Build the `plugin/statusline` brick: a
truecolor half-block rasterizer that turns the renderer's pure sprite (`packages/renderer/src/sprite/`
— `Soul → SpriteParams`) into terminal output, and **promote the demo-only animation director to the
runtime engine**, driving it off real Claude Code session signals (context%, prompt-submit, thinking,
success/error, compaction). Idle gestures + reactive events + the birth animation (first install)
all play here. This is the payoff brick — it pulls the sprite + hooks + director together into the
live cloud-spirit that lives in the statusline.

## Key files (expected)
- `packages/plugin/src/statusline/` — rasterizer (truecolor half-blocks) + runtime director (new)
- Consumes: `renderer`'s pure sprite (`packages/renderer/src/sprite/`), the soul from `storage`
- Design truth to promote: the demo director + rasterizer prototyped in `scripts/` (see `NOTES.md`),
  the 9 reactive animations, idle engine (breathing/gestures/2:15 swap/twinkle), birth animation
  (`scripts/build-ul-birth.mjs`)
- Read first: `SPEC.md` (Expression → the *look*), `docs/ARCHITECTURE.md`, Phase 4 in `BUILD_GUIDE.md`,
  `NOTES.md` (viz-exploration keepers)

## Out of scope
- `plugin/mcp`, `plugin/skill` (`/ul`) — separate brick
- Setup wizard / 90d neglect-death clock — separate brick
- Plugin manifest / `/plugin` install — separate brick
- Do NOT re-derive sprite geometry — consume the pure renderer sprite; keep `core`/`renderer` pure.
  All IO/animation timing lives at the plugin edge.

## Key files (actual)
- `packages/plugin/src/statusline/sprite-data.ts` — locked pixel art bodies, 8 wisp variants, gestures, breathing
- `packages/plugin/src/statusline/rasterizer.ts` — `compose(colors, wispCells, overlay, dy) → PixelGrid`; `pixelGridToAnsi()`; HSL→RGB color derivation from `SpriteParams`
- `packages/plugin/src/statusline/director.ts` — `AnimDirector`: `signal(DirectorEvent)` + `tick() → AnimFrame`; full mode/pulse/gesture conflict-resolution
- `packages/plugin/src/statusline/birth.ts` — `birthFrames()` (pure) + `playBirth()` (IO); terminal birth animation
- `packages/plugin/src/statusline/statusline.ts` — `StatusLine` runtime: `setInterval` loop + `signal()` surface for hooks
- `packages/plugin/src/statusline/index.ts` — public exports
- `packages/plugin/test/statusline.test.ts` — 55 tests

## Verification
- Build: pass
- Tests: pass (267 passed, 55 new statusline tests)
- Scope kept: yes — rasterizer consumes `renderer`'s `SpriteParams`; `core`/`renderer` stay pure; all IO at the plugin edge
- Summary: truecolor half-block rasterizer + runtime director (promoted from demo-only scripts/) with full signal interface driven by real session events; birth animation terminal player

## Status
Status: ready-to-merge
