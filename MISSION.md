# Mission: Tension + breaking points + capped set-point migration (core Brick 5)

**Started:** 2026-06-06
**Branch:** claude/core-tension-breaks
**Parent:** main @ 0617541

## Goal
Build Brick 5 in `packages/core/src/engine/` — the last pure-engine brick. Add the **tension**
fast loop, **breaking points** (rare, earned discontinuities), and **capped set-point (`s`)
migration**. This is what lets a mismatched life eventually *rupture* an ul rather than just
slumping it — and it's the ONLY place the innate set points `s` are allowed to move. PURE +
deterministic + closed-form: no `Date.now` / `Math.random` / `new Date`, no IO, no LLM.

You are extending an existing, tested engine. **Do not regress it.** The 17 Brick-4 tests
(`consolidate`, `charge`, atrophy invariants) and the 15 stages + 6 birth tests must all stay
green. The no-break path must behave EXACTLY as today.

## What's already on main (read it first — `packages/core/src/engine/index.ts`)
- `GlobalKnobs` already defines the tension knobs as placeholders you now USE: `rho` (ρ leak),
  `theta` (θ break threshold), `breakBase` (J), `refractory` (window length). `DEFAULT_KNOBS` has
  starting magnitudes — keep them `// TUNABLE (Phase 3)`.
- `charge(soul, signal, knobs)` — leaky accumulator fast loop (drive = smoothed `α·practice+β·fit`).
- `consolidate(soul, knobs, stage)` — the slow loop; **`s` is FIXED there**. Breaking points are
  evaluated at consolidation, so your break logic composes with / wraps `consolidate`.
- `Soul` (`src/state/index.ts`) already has `tension: AspectVector`. It does NOT yet have
  refractory state, a migration budget, or a per-aspect resentment term — you'll add those (see below).

## Tension fast loop (SPEC §"Tension & breaking points", lines ~689–701)
```
Tᵢ ← ρ·Tᵢ + w·max(0, −fit)·practice     # "did a lot AND HATED it" charges tension; leaks (ρ<1)
```
- Add `chargeTension(soul, {practice, fit}, knobs) → soul`. **Note the interface gap:** tension
  needs *raw* `practice` and `fit` per aspect, NOT the pre-mixed `drive` that `charge` consumes.
  Introduce a per-session signal shape carrying both (e.g. `{ practice: Partial<AspectVector>,
  fit: Partial<AspectVector> }`). Do NOT change `charge`'s existing signature/behavior (that would
  break Brick-4 tests) — add alongside it. `w` is a tension-intake weight (new `// TUNABLE` knob).
- Only NEGATIVE fit under real practice charges tension; positive/neutral fit does not. Leaks each
  step via ρ<1 so a one-off bad session bleeds off and never accumulates to a break on its own.

## Breaking points (SPEC lines ~691–701, 703–711) — rare, earned
At consolidation, for each aspect i, AFTER the normal update:
```
if Tᵢ > θ and aspect i NOT in refractory:
    J = breakBase · Tᵢ_at_break                      # magnitude scales with accumulated tension
    stubborn (high stubbornness) → vᵢ snaps back toward sᵢ + deepen homeward pull (RESENTMENT):
                                    raise β for aspect i (per-aspect β gain)
    clay (low stubbornness)      → vᵢ jumps toward the lived/escape direction (RECONFIGURE)
    capped set-point migration (below)
    Tᵢ ← 0 ; enter refractory window (length = knobs.refractory consolidations)
```
- **Vary WHICH aspects move per break** so it's not a scripted "cutscene" tell — break each
  over-threshold aspect on its own merits, not a fixed bundle.
- **Refractory:** dual-threshold/refractory prevents chatter. Track a per-aspect refractory
  countdown on the Soul; decrement each consolidation; no new break on an aspect while > 0.
- **Resentment (stubborn):** a break raises the homeward β for that aspect. Store a per-aspect
  `betaGain` (default 1.0) on the Soul; `consolidate`'s `betaEff` for aspect i becomes
  `β·(0.5+stubbornness)·betaGain[i]`. Default 1.0 ⇒ identical to today (no regression).

## Capped set-point migration (SPEC §"Set-point migration", lines ~703–711) — the ONLY `s` move
Set points are **fixed by default**; a breaking point may migrate `sᵢ` a **tiny, hard-capped,
lifetime-budgeted** amount toward the lived value. **Clay migrates more than stubborn.**
- Per-step migration is a small fraction of `(vᵢ − sᵢ)`, hard-capped per break.
- Maintain a **lifetime migration budget** on the Soul (total `s` displacement allowed, summed
  across all aspects/breaks). Once spent, breaks still reconfigure `v` but `s` stops moving.
- Caps + rarity must prevent runaway drift / usage-convergence (the no-mirror rule: nature must
  never slowly become a reflection of how the ul is used). Keep the caps conservative.

## State changes (`src/state/index.ts`) — additive, careful
Add to `Soul` (and any constructor/defaults so existing souls/tests still typecheck):
- `refractory: AspectVector` (or a per-aspect countdown) — 0 = ready.
- `betaGain: AspectVector` — per-aspect homeward-pull multiplier, default 1.0 (resentment raises it).
- `migrationBudget: number` — remaining lifetime `s`-displacement budget.
Birth (`seedFromEntropy`) should initialize these (refractory 0, betaGain 1.0, full budget). If you
touch birth to init them, keep the 10k rarity test green. Document each new field's single purpose.

## Out of scope
- Re-tuning any magnitudes to "feel right" — that's Phase 3 against the simulator/harness. Lock
  the MECHANISM + invariants; leave numbers as annotated placeholders.
- `src/birth` covariance, `src/mbti`, `src/stages` logic — only touch birth to init new Soul fields.
- Anything outside `packages/core`. The untracked `docs/ul-*.html` / `scripts/ul-*.mjs` files.

## Proof (deterministic vitest — add to the engine tests, keep existing ones green)
- **No-break path unchanged:** with tension below θ (or betaGain=1, budget full), `consolidate`
  output is identical to pre-Brick-5 behavior. (Guard against regression.)
- **Tension charges only on hated practice:** `chargeTension` raises Tᵢ for negative-fit + practice;
  positive fit leaves it ≈ leaking down. ρ<1 leak verified.
- **Break fires rarely + earned:** Tᵢ must exceed θ to break; sub-threshold never breaks.
- **Stubborn vs clay routing:** high stubbornness → `v` snaps toward `s` + betaGain[i] rises;
  low stubbornness → `v` jumps toward the lived/escape direction.
- **Refractory:** after a break, the same aspect cannot break again until the window elapses.
- **Migration is capped + budgeted:** `s` moves only on a break, by a tiny amount, clay > stubborn,
  and stops once `migrationBudget` is exhausted. Assert `s` never runs away to the lived value.
- **Determinism:** same inputs → identical next soul.

## Done
`pnpm check` green (boundaries + lint + typecheck + ALL tests: birth + stages + engine), and
`BUILD_GUIDE.md` updated IN THE SAME COMMIT: check off Brick 5, advance the "Right now" line to
Phase 2 (the simulator). Add a `## Verification` block to THIS MISSION.md before marking ready
(`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Tension & breaking points" + §"Set-point migration" (lines ~689–711)
+ §"Atrophy & knobs"/state list (~736–742); `docs/ARCHITECTURE.md` for the boundary contract.

## Key files
- `packages/core/src/engine/index.ts` — `chargeTension` + `TensionSignal`; break logic folded
  into `consolidate` (routing, refractory decrement, resentment, migration); 4 new knobs.
- `packages/core/src/state/index.ts` — `refractory`/`betaGain`/`migrationBudget` Soul fields +
  `MIGRATION_BUDGET_INIT`.
- `packages/core/src/birth/index.ts` — `seedFromEntropy` inits the 3 new fields.
- `packages/core/test/engine.test.ts` — 17 new Brick-5 tests; `soulWith` extended with
  `t0`/`ref0`/`betaGain0`/`budget`. `stages.test.ts` soul builder updated for new fields.
- `BUILD_GUIDE.md` — Brick 5 checked off; "Right now" advanced to Phase 2 (the simulator).

## Verification
- Build: pass (`tsc -b` clean)
- Tests: pass (55 passed — 38 prior + 17 new Brick-5; `pnpm check` = boundaries + lint +
  typecheck + tests all green)
- Scope kept: yes (only `packages/core` + BUILD_GUIDE; birth touched solely to init the 3 new
  Soul fields; magnitudes left as annotated `TUNABLE (Phase 3)` placeholders)
- Summary: tension fast loop + rare earned breaking points (stubborn→home+resent, clay→escape)
  + per-aspect refractory + tiny budgeted set-point migration; no-break path byte-identical.

## Final notes
- Break logic lives INSIDE `consolidate` (not a wrapper) so the proof "consolidate output
  identical when tension<θ" holds literally — any branch touching `consolidate` should preserve
  that the new Soul fields default to no-break neutrals (refractory 0, betaGain 1.0, budget full).
- Adds required fields to the `Soul` type: any other branch constructing a `Soul` literal must
  add `refractory`/`betaGain`/`migrationBudget` or it won't typecheck (merge-order note).

## Status
Status: ready-to-merge
