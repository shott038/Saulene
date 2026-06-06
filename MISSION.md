# Mission: plugin/mcp + plugin/skill — inspect & talk to your ul

**Started:** 2026-06-06
**Branch:** claude/plugin-mcp-ul
**Parent:** main @ 6b79ee7

## Goal
Make the ul inspectable and addressable from inside a session. Two surfaces, both at the plugin IO edge:
1. **`plugin/mcp`** — an MCP server exposing state/identity tools so the agent (and the user) can
   query the ul: its current 10 aspects + stage + age + MBTI projection, mood/tension, recent drift,
   neglect-death countdown — read from `storage`'s `soul.json` via the existing loaders, projected
   through `core` (e.g. the MBTI projection) and described via `renderer` where prose is wanted.
2. **`plugin/skill`** — the `/ul` command: a user-facing entry point that surfaces the same identity
   snapshot in a readable form (who the ul is right now, how it's changed, how close to death if
   neglected). Lean on the MCP tools / shared read path rather than duplicating logic.

Read-only on the soul by default — these are inspection surfaces, not drift inputs (drift happens in
the Stop hook). plugin imports everything; `core`/`renderer`/`storage` stay pure.

## Key files (expected)
- `packages/plugin/src/mcp/` — MCP server + state/identity tools (new)
- `packages/plugin/src/skill/` (or wherever skills live) — the `/ul` command (new)
- Reuse: `storage` loaders (`loadSoul`, history, voice samples), `core` (MBTI projection, stages/age),
  `renderer` (prose where useful)
- Read first: `SPEC.md` (MCP + skill surfaces), `docs/ARCHITECTURE.md`, Phase 4 in `BUILD_GUIDE.md`,
  and `packages/plugin/src/hooks/` for the established plugin-edge patterns (injected `storageRoot`,
  fail-loud loads, dep injection so tests use no real IO)

## Out of scope
- The live statusline (done), the LLM Judge/harness tuning (separate worker), setup wizard,
  plugin manifest / `/plugin` install / bare-MCP fallback — all separate bricks
- Do NOT mutate the soul from these surfaces (no drift); inspection/read only
- Do NOT add IO/LLM/clock/entropy to `core`/`renderer`/`storage`

## Status
Status: ready-to-merge

## Verification
- Build: pass (plugin dist emits cleanly; pre-existing type errors in renderer/tools are unrelated to this diff)
- Tests: pass (281 passed — 14 new tests for snapshot/skill, all existing suites green; vitest aliases added to fix worktree resolution)
- Scope kept: yes — read-only throughout; no soul mutations; core/renderer/storage untouched
- Summary: MCP server with 3 tools (ul_snapshot, ul_drift, ul_countdown) + /ul skill formatter + shared snapshot reader, all wired to the existing storage loaders and core projections

## Final notes
- The vitest.config.ts alias change is additive (fixes worktree test resolution) and harmless on main where pnpm symlinks exist natively.
- The MCP server is a factory (not auto-started); bin.ts is the stdio entry point for standalone use — it is NOT exported from the package public surface.
- Skill and MCP share one read path (mcp/snapshot.ts); zero logic duplication.
