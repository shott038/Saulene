# Mission: renderer sprite formalization — geometry + soul→SpriteParams into the pure renderer

**Started:** 2026-06-06
**Branch:** claude/sprite-formalization
**Parent:** main @ 2dddec2

## Goal
The terminal ul sprite's visual design is LOCKED (Jun 6) but its truth still lives in `scripts/`
and `NOTES.md`. Formalize it into the pure `packages/renderer/src/sprite/` (currently an empty
stub): (1) port the canonical geometry (`scripts/ul-geometry.mjs`, `docs/ul-default.svg`) and the
soul→SpriteParams mapping (10 aspects + stage → individualized sprite) into pure renderer code
that imports only `core`; (2) add golden-file tests + per-aspect ablation locality, mirroring the
text renderer's test discipline; keep it PURE (no IO, no clock, no entropy). Promoting the demo
director to runtime + the terminal rasterizer is the Phase-4 statusline brick, NOT this mission —
this is the pure, golden-tested core of the look.

## Key files (expected)
- `packages/renderer/src/sprite/` — the empty stub to fill (geometry + SpriteParams mapping)
- Source of design truth to port: `scripts/ul-geometry.mjs`, `scripts/build-ul-birth.mjs`,
  `docs/ul-default.svg`, `NOTES.md` (keepers from the viz-exploration worktree)
- Mirror the test style of the existing text renderer (golden + ablation locality)
- Read first: `SPEC.md` (Expression → the *look*), `docs/ARCHITECTURE.md`, Phase 3 in `BUILD_GUIDE.md`

## Out of scope
- Terminal rasterizer (truecolor half-blocks) + the runtime animation director — Phase 4 statusline
- Wiring to real Claude Code session signals — Phase 4
- The text renderer layers (spine/framing/drift) — separate item
- Do NOT make the sprite package impure — it imports only `core`

## Status
Status: ready-to-merge

## Verification
- Build: pass (tsc -b clean, boundaries clean)
- Tests: pass (43 new sprite tests + 166 total packages/ tests all green)
- Scope kept: yes — geometry + SpriteParams mapping + golden tests only; rasterizer/director deferred per mission
- Summary: `packages/renderer/src/sprite/` is now a pure, golden-tested `Soul → SpriteParams` module — all 10 aspects + stage + birth-entropy jitter resolved into typed visual params, with ablation locality, monotonicity, stage, seed, and hash tests.

## Final notes
- `SPRITE_EXCLUSIVE` documents the ablation contract (which aspects exclusively own which params); the test suite enforces it bidirectionally.
- Multi-aspect params (hue, lightness shared by openness + intellect) are verified via snapshot + monotonicity, not exclusive-ownership tests.
- Pre-existing unrelated failure: `tools/harness/test/metrics.test.ts` fails because `@saulene/simulator` isn't built — not touched here.
