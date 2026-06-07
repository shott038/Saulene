# Mission: setup wizard — reality warning → watch-only birth → pick level (+ 90d neglect-death clock)

**Started:** 2026-06-06
**Branch:** claude/setup-wizard
**Parent:** main @ 49bb928

## Goal
The first-run onboarding flow that brings a ul into existence on the user's machine. Three mandatory
beats, in order:
1. **Reality warning** — a clear, mandatory acknowledgement up front: this is a slowly-developing
   artificial personality, not a sentient being / not a person; sets honest expectations (per SPEC).
   The user must acknowledge before proceeding.
2. **Watch-only birth** — the ul is born: birth-seed the soul (`core` birth), persist it (`storage`),
   and play the **birth animation** (the statusline brick's `birth.ts` / `playBirth()`) while the
   user *watches* — they don't author the personality, they witness it emerge.
3. **Pick level** — the user chooses the ul's expression level; write it to config (the same config
   `plugin/hooks` gating reads via `loadConfig`/`isGated`).

Also finish/verify the **90-day neglect-death clock**: the flat wall-clock check already lives in
`session-start.ts` (`now - lastUsedAt > 90d → dormant`). Make sure the lifecycle is coherent end to
end — birth sets `lastUsedAt`, the clock is consistent, and a dead ul is handled gracefully (clear
message; the SPEC's restore path is a Phase-5 token concern and OUT of scope here).

## Key files (expected)
- `packages/plugin/src/setup/` (or `wizard/`) — the wizard flow (new). The IO/prompts live at the
  plugin edge.
- Reuse: `core` birth seeding, `storage` (`saveSoul`, `defaultRoot`), `plugin/hooks/config.ts`
  (the level config shape — keep it the single source so gating reads what the wizard writes),
  `plugin/statusline` birth animation (`birth.ts`)
- Read first: `SPEC.md` (setup wizard + reality warning + neglect-death), `docs/ARCHITECTURE.md`,
  Phase 4 in `BUILD_GUIDE.md`, and `packages/plugin/src/hooks/` for the established edge patterns
  (injected `storageRoot`/`now`, dep injection so tests use no real IO)

## Coordination note
A sibling worktree (`claude/plugin-manifest`) is wiring the plugin manifest in parallel. Keep the
wizard's entry point clean and exported so the manifest can invoke it (e.g. as a command / first-run
step). If you touch `config.ts`, keep changes minimal + additive to avoid conflicting with it.

## Out of scope
- Plugin manifest / `/plugin` install wiring — the sibling brick
- Solana token / paid restore (Phase 5)
- Renderer/engine changes; do NOT add IO/LLM/clock/entropy to `core`/`renderer`/`storage`

## Key files (actual)
- `packages/plugin/src/setup/wizard.ts` — the wizard (new; 3 beats, all deps injected)
- `packages/plugin/src/setup/index.ts` — re-export for manifest sibling
- `packages/plugin/src/hooks/config.ts` — added `saveConfig()` (minimal additive)
- `packages/plugin/src/hooks/index.ts` — exports `saveConfig`
- `packages/plugin/src/index.ts` — exports `./setup/index.js`
- `packages/plugin/test/wizard.test.ts` — 14 new tests

## Verification
- Build: pass
- Tests: pass (305 passed, 14 new wizard tests)
- Scope kept: yes — core/renderer/storage untouched; config.ts change is additive only; `runWizard` exported cleanly for the manifest sibling
- Summary: wizard runs 3 beats (reality warning + ack gate → watch-only birth → level pick + config write); 90-day clock starts at birth via `soul.lastUsedAt = now`; fully dep-injected; 305/305 green

## Final notes
- `saveConfig` added to `config.ts` — minimal, additive. If the manifest sibling also touches `config.ts`, this is a safe additive-only change (new function, no changes to existing functions).
- Pre-existing biome lint failures exist in files this branch did NOT touch (mcp/bin.ts, statusline/director.ts, etc.) — not introduced here.
- The 90-day neglect-death clock is coherent end to end: birth sets `lastUsedAt = now`, `session-start.ts` checks `now - soul.lastUsedAt > 90d` and resets on each live session. No changes needed to `session-start.ts`.

## Status
Status: ready-to-merge
