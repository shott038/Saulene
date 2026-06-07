# Mission: life-sim foundation — the perception-fingerprint corpus (Layer B)

**Started:** 2026-06-07
**Branch:** claude/life-sim-fingerprint
**Parent:** main @ e90510f

## Goal
Build the foundation brick of a large-scale ul life-simulation: a new dev-only package
`tools/life-sim` that bridges the cheap deterministic engine to *real* CLI behavior. It contains
(1) a **synthetic user** that drives real multi-turn conversations through the real renderer +
`claude -p`, and (2) a **fingerprint builder** that records what the REAL perception engine
(`perceive()`) actually emits per bucket — so the mass population sim (a sibling worktree, W2) can
be driven by *measured statistics* instead of hand-authored scripts. This is Layer B of the
surrogate pyramid: pay for real-CLI truth ONCE, then simulate millions of lives for free.

## What to build (in `tools/life-sim`)
1. **Package scaffold** — `@saulene/life-sim`, mirror `tools/harness`'s package.json/tsconfig.
   Wire the boundary graph: in `scripts/check-boundaries.mjs` add
   `"life-sim": ["core", "renderer", "perception", "simulator"]` to `ALLOWED` and
   `["life-sim", "tools/life-sim"]` to `PKG_DIRS`; add the row to the table in
   `docs/ARCHITECTURE.md`; add the tsconfig project reference. `pnpm check` MUST stay green.
2. **SyntheticUser** — persona (e.g. creative-warm, technical-curt) + optional arc (persona shifts
   over the life) → the user's side of a turn. Written against the injected `LlmClient` port from
   `@saulene/perception` (NOT a hardcoded SDK). Reuse the `ClaudeCliClient` pattern in
   `tools/harness/src/llm.ts` (subscription `claude -p`, no API key) as the default backend, fully
   dependency-injected so tests use a fake `LlmClient` and spawn ZERO real processes.
3. **Conversation runner** — multi-turn (2–4 turn) synthetic user ↔ ul exchange. The ul's turn is
   produced by calling the `LlmClient` with the REAL `render(soul).text` from `@saulene/renderer`
   injected as the voice (mirror the plugin's S1 injection). Output: a transcript object that
   `perceive()` accepts.
4. **`ledgerToSignals`** — EXTRACT the perception-ledger → `{practice, fit}` per-aspect conversion
   currently in `packages/plugin/src/hooks/stop.ts` into a NEW pure exported function in
   `@saulene/perception` (one source of truth shared by plugin + life-sim). Update `stop.ts` to
   import it; add a parity test. **This is the only edit outside `tools/life-sim`.**
5. **Fingerprint builder** — run conversations across a bucketed space
   (persona × workType × coarse soul-state-bucket × stage), run REAL `perceive()` on each
   transcript, record the empirical ledger distribution to a JSONL corpus. Define the bucketing
   scheme + the corpus record format:
   `{ bucket:{persona,workType,stage,stateBucket}, ledger:<Observation[]+sessionSignificance>, meta:{soulHash,model} }`.
6. **Shared contract (W2 consumes this — define + export cleanly):** the `LedgerSource` interface
   `next(soul, {persona, workType, sessionIndex}) → ScriptedSession`, a `CorpusLedgerSource` that
   samples `ScriptedSession` ledgers from the corpus deterministically (injected RNG/seed — NO
   `Math.random`), and the corpus-record TypeScript type.

## Constraints
- `core` + `renderer` stay PURE (zero IO / LLM / clock). All LLM + spawn dependency-injected.
- Tests use fakes only (no real `claude -p`, no network) so they run in CI.
- Cache real calls to disk (reuse the `JudgeCache` pattern in `tools/harness/src/cache.ts`) so
  re-runs are free.
- A runnable script (gated behind an env flag / out of the default test path, like harness's
  `live.ts`) actually builds a small corpus via real `claude -p`.

## Key files (expected)
- `tools/life-sim/` (new): `src/synthetic-user.ts`, `src/conversation.ts`, `src/fingerprint.ts`,
  `src/ledger-source.ts`, `src/buckets.ts`, `src/index.ts`, `src/llm.ts` (or reuse harness pattern),
  `test/*.test.ts`, `package.json`, `tsconfig.json`, `FINDINGS.md`
- `scripts/check-boundaries.mjs`, `docs/ARCHITECTURE.md`, root `tsconfig` references
- `packages/perception/src/` (add `ledgerToSignals`), `packages/plugin/src/hooks/stop.ts` (import it)

## Out of scope
- The population runner, empirical ledger generator, experiment design (W2 — sibling worktree).
- Golden closed-loop lives + validation metrics (W3 — follow-on).
- Do NOT change engine magnitudes or `core`/`renderer` behavior.

## Verification
- `pnpm check` green (boundaries + lint + typecheck + tests).
- The fingerprint script produces a real corpus JSONL when run.
- `FINDINGS.md`: bucket coverage + a sanity check that grind buckets show negative fit and aligned
  buckets positive fit.
- Update `BUILD_GUIDE.md` in the SAME commit (add a "large-scale life-sim" section; check off Layer B).

## Status
Status: in-progress
