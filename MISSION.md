# Mission: population-scale life-sim + experiment design (Layer A)

**Started:** 2026-06-07
**Branch:** claude/life-sim-population
**Parent:** main @ e90510f

## Goal
Build the scale + rigor half of the large-scale ul life-simulation: run **millions of deterministic
lives for free** through the pure engine, driven by an empirical ledger generator, and a statistical
experiment-design toolkit so we can *accurately* test "personality changes believably over a life"
with tight confidence intervals instead of brute force. This is Layer A of the surrogate pyramid —
it consumes the perception-fingerprint corpus produced by the sibling worktree
`claude/life-sim-fingerprint` (W1).

## The shared contract with W1 (build to this exactly)
W1 owns these type definitions; you build a consumer against the SAME shape and wire to W1's real
types at merge. Until W1 lands, build against a small **fixture corpus** matching this format:
- **Corpus record (JSONL):**
  `{ bucket:{persona,workType,stage,stateBucket}, ledger:<perception Observation[] + sessionSignificance>, meta:{soulHash,model} }`
- **`LedgerSource` interface:** `next(soul, {persona, workType, sessionIndex}) → ScriptedSession`
  (`ScriptedSession` is the existing `tools/simulator` per-aspect `{practice, fit, significance}` row).

## What to build
1. **`EmpiricalLedgerSource`** — implements `LedgerSource`: given the ul's current soul + the
   session's persona/workType, pick the matching corpus bucket (coarse soul-state bucketing) and
   sample a `ScriptedSession` from its recorded ledger distribution. Convert sampled perception
   `Observation[]` → per-aspect `{practice, fit}` using `@saulene/perception`'s `ledgerToSignals`
   (the pure fn W1 extracts; until then, mirror `packages/plugin/src/hooks/stop.ts` and add a TODO
   to swap to the shared import at merge). Deterministic — injected RNG/seed, NO `Math.random`.
2. **Population runner** — `population({seeds, userScripts, knobs, ledgerSource}) → results`: fan out
   N seeds × M user-life-scripts × K knob-sets through the existing `lifetime()` loop. Deterministic
   and fast (pure engine, no LLM). Record aggregate trajectory metrics: adult-personality
   distribution, divergence (aligned vs grind), stage-timing, break rarity across the population.
3. **Experiment-design toolkit:**
   - **Common-random-number / paired designs** — same seed + same user-script, vary only one knob,
     so per-life variance cancels (the determinism gives CRN for free).
   - **Frozen-soul control A/B** — same user-script against a drifting ul vs a ul frozen at birth;
     measure whether lived experience *causally* moved it, in the narratable direction.
   - **Latin-hypercube sampling** over (seed × script × knobs) — cover the space with far fewer runs
     than a full grid.
   - **Power analysis helper** — given an observed effect + variance, how many lives for a target CI.
4. **A runnable population script** (out of the default test path) that runs a real
   multi-thousand-life sweep and dumps results to JSON, plus a `FINDINGS.md` writing up the
   population dynamics + a worked power-analysis example.

## Constraints
- Pure / deterministic everywhere — this layer runs NO LLM (that's W1's job). All randomness via
  injected seed. Reproducible: same inputs → identical results.
- New package `tools/life-sim-pop` OR a module inside `tools/life-sim` — **coordinate to avoid
  colliding with W1.** SAFEST: put your code in a NEW package `tools/life-sim-pop`
  (@saulene/life-sim-pop, boundary `["core","renderer","perception","simulator"]`) so W1 and W2 edit
  disjoint dirs; wire it into `scripts/check-boundaries.mjs` + `docs/ARCHITECTURE.md` + tsconfig.
  (W1 separately creates `tools/life-sim`; the merger will reconcile the two boundary-file edits —
  keep yours minimal and additive.)
- `pnpm check` MUST stay green.

## Key files (expected)
- `tools/life-sim-pop/` (new): `src/empirical-source.ts`, `src/population.ts`, `src/experiment.ts`
  (CRN/paired/frozen-control/LHS/power), `src/index.ts`, `test/*.test.ts`, `package.json`,
  `tsconfig.json`, `FINDINGS.md`, plus a `fixtures/corpus.sample.jsonl`
- `scripts/check-boundaries.mjs`, `docs/ARCHITECTURE.md`, root tsconfig references

## Out of scope
- The synthetic user, conversation runner, real fingerprint corpus, `ledgerToSignals` extraction
  (W1 — sibling worktree). Build against the fixture + the documented contract.
- Golden closed-loop lives + felt-expression validation metrics (W3 — follow-on).
- No engine-magnitude or `core` behavior changes.

## Verification
- `pnpm check` green.
- The population script runs a ≥1,000-life sweep deterministically and dumps results.
- `FINDINGS.md`: population dynamics (divergence/stage-timing/break-rarity distributions) + a worked
  power-analysis example showing how many lives buy a target CI.
- Update `BUILD_GUIDE.md` in the SAME commit (add to the "large-scale life-sim" section; check off
  Layer A).

## Status
Status: in-progress
