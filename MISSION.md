# Mission: plugin/hooks — SessionStart voice inject + Stop→drift pipeline

**Started:** 2026-06-06
**Branch:** claude/plugin-hooks
**Parent:** main @ 2dddec2

## Goal
Build the `plugin` package's hook edge — the ONLY IO boundary in the system. SessionStart
reads the soul from `storage`, runs the `renderer` to produce the ul's current voice/identity,
and injects it into the session **gated by the user's chosen level**. Stop runs the drift
pipeline: `perceive()` the just-ended session into a ledger via the LLM port, feed the
observations through the `core` consolidation engine, and persist the updated soul back through
`storage`. This is what turns the pure engine + perception + storage into something that
actually lives across real Claude Code sessions.

## Key files (expected)
- `packages/plugin/src/hooks/` — SessionStart + Stop hook handlers (new)
- Wires together: `core` (consolidation/aging/drift), `perception` (`perceive()`, `LlmClient`),
  `renderer` (`render(soul)`), `storage` (load/save soul, history, voice samples)
- Read first: `SPEC.md`, `docs/ARCHITECTURE.md` (the boundary contract), Phase 4 in `BUILD_GUIDE.md`

## Out of scope
- `plugin/mcp`, `plugin/skill` (`/ul`), `plugin/statusline` — separate bricks
- Setup wizard / neglect-death clock — separate brick
- Plugin manifest / `/plugin` install — separate brick
- Do NOT add IO, LLM, clock, or entropy to `core` — the truth stays pure; injection only

## Key files (actual)
- `packages/plugin/src/hooks/config.ts` — LevelConfig, sauleneRoot, loadConfig, hasGitAncestor, isGated
- `packages/plugin/src/hooks/llm.ts` — AnthropicLlmClient (real LlmClient impl, haiku, temp=0)
- `packages/plugin/src/hooks/session-start.ts` — sessionStart(): gate → load → death-check → render → inject
- `packages/plugin/src/hooks/stop.ts` — stop(): perceive → signal-convert → charge → consolidate → persist
- `packages/plugin/test/hooks.test.ts` — 29 deterministic tests (temp dirs, FakeLlmClient)
- `packages/plugin/package.json` — added @anthropic-ai/sdk dependency

## Verification
- Build: pass (tsc -b, no new errors)
- Tests: pass (169 total / 29 new in plugin, zero failures)
- Boundaries: pass (check:boundaries clean)
- Lint: pre-existing failures in scripts/*.mjs (from viz-exploration merge, not this brick)
- Scope kept: yes — only packages/plugin/src/hooks/ + test; core/renderer/perception/storage untouched
- Summary: SessionStart injects level-gated voice from live soul state; Stop runs the full perceive→consolidate→persist drift pipeline; both wired through injected deps (storageRoot, llm, now) so tests use no real IO.

## Status
Status: ready-to-merge
