# Mission: Stages + aging (core Brick 3) — the per-stage rule table the engine runs on

**Started:** 2026-06-06
**Branch:** claude/core-stages-aging
**Parent:** main @ 81db950

## Goal
Build Brick 3 in `packages/core/src/stages/`: the discrete life-stage model. Map a soul's
maturity points (`mp`) to a `Stage`, and give each stage the rule-knobs the consolidation
engine (Brick 4, built next, separately) will consume — plasticity, set-point-pull sign, and
volatility. Also implement rate-capped MP accrual and fixed-band stage transitions with slight
per-ul jitter. PURE: no `Date.now` / `Math.random` / `new Date`; any jitter is derived
deterministically from the soul (e.g. a stable per-ul hash), not live entropy.

This brick is **structural and load-bearing** — Brick 4 (the heart of the engine) imports this
table. Getting the *interface* right matters more than the exact magnitudes (which get tuned in
Phase 3). Lock the shape, the signs, and the ordering; use sensible placeholder magnitudes.

## The four stages (SPEC §"Lifespan — life stages", lines ~768–827)
| Stage | Plasticity | Set-point pull (sign) | Volatility | Character |
|---|---|---|---|---|
| **Childhood** | highest | strong **+** (toward nature) | low–med | absorbs everything; MBTI unstable |
| **Adolescence** | high + chaotic | **inverts: small NEGATIVE β** (repels from nature, never fully off) | **spikes** | rebels away; where divergence is born |
| **Early adulthood** | dropping | returns to normal **+** | settling | crystallization; integrates teen experiments |
| **Old adulthood** | floor (≈0, not literally 0) | normal **+** | low | locked; freezes the lived blend, does NOT snap to set point |

Decided invariants you MUST preserve (these are not tunable):
- Plasticity ordering: childhood ≥ adolescence (high) > early-adult > old-adult (floor).
- **`stage_sign` is the load-bearing trick:** +1 normally, **negative & small in adolescence**
  (`β_eff = small negative`, a residual tether — nature goes quiet but never zero, so a teen
  still rebels *as itself*). Old age plasticity ≈ floor so the lived blend freezes.
- The engine's update rule (for reference — you are NOT building it here, Brick 4 is):
  `vᵢ ← vᵢ + plasticity(stage)·[ α·drive·room + β_eff·stage_sign·(sᵢ − vᵢ) ]`
  Your job is to supply `plasticity(stage)`, `stage_sign(stage)`, and a per-stage volatility
  so that formula has clean inputs.

## What to implement
1. **`Stage` type** (enum/union: childhood | adolescence | early_adulthood | old_adulthood) — define it
   in `src/stages/index.ts` (NOT in `src/state`) to avoid colliding with the parallel birth worker.
2. **`stageFromMp(mp, soul?) → Stage`** — fixed MP age bands + slight per-ul jitter on the band
   boundaries (deterministic from the soul, so the same ul always crosses on the same clock).
3. **Per-stage rule table** — `stageRules(stage) → { plasticity, stageSign, volatility }` (or a
   const record). Placeholder magnitudes are fine; bands/magnitudes are flagged for Phase-3 tuning.
4. **Rate-capped MP accrual** — `accrueMp(soul, sessionSignificance) → mp'` (or similar): bounded
   per-step gain (a daily/usage cap so age can't be farmed). The significance→MP mapping detail is
   deferred — implement the cap + a clean bounded mapping, comment it as tunable.

## Mark every deferred number clearly
SPEC explicitly defers: exact plasticity/volatility magnitudes, MP band boundaries, daily MP cap,
and what counts as 1 MP (SPEC lines ~80, ~857). Pick reasonable placeholders and annotate each with
a `// TUNABLE (Phase 3)` comment so the tuning pass can find them. Do NOT agonize over exact values.

## Key files (expected)
- `packages/core/src/stages/index.ts` — Stage type, stageFromMp, stageRules, accrueMp
- `packages/core/test/stages…` — unit tests (see below)

## Out of scope
- The consolidation update rule itself (Brick 4) and tension/breaking (Brick 5) — different worktrees.
- `src/birth` / `src/mbti` — owned by the parallel `core-birth-seeding` worker. Don't touch them or
  `src/state/index.ts` (add your Stage type in `src/stages` to avoid a merge collision).
- The untracked `docs/ul-*.html` and `scripts/ul-*.mjs` files.

## Proof (deterministic vitest)
- `stageFromMp` returns the four stages in correct MP order; boundary jitter is deterministic
  (same soul → same crossing) and bounded.
- `stageRules` invariants hold: plasticity ordering correct; `stageSign` negative ONLY in
  adolescence and positive elsewhere; old-adult plasticity is the floor.
- `accrueMp` respects its per-step cap (can't exceed the cap regardless of input significance).

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE
SAME COMMIT: check off Brick 3, leave the "Right now" line pointing at Brick 4 (Consolidation).

Source of truth: `SPEC.md` §"Lifespan — life stages" + §Engine update rule (lines ~676–827);
`docs/ARCHITECTURE.md` for the boundary contract (core stays pure).

## Status
Status: ready-to-merge
