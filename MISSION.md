# Mission: Consolidation update rule (core Brick 4) — the heart of the engine

**Started:** 2026-06-06
**Branch:** claude/core-consolidation
**Parent:** main @ 17ba5bd

## Goal
Build Brick 4 in `packages/core/src/engine/`: the **consolidation step** — the closed-form,
pure function that ages a soul forward one consolidation. `consolidate(soul, knobs, stage) → soul`.
This is the heart of the whole system: it's what makes uls actually grow, hold what they built,
and (in adolescence) rebel away from their nature. PURE + deterministic + closed-form: no
`Date.now` / `Math.random` / `new Date`, no IO, no LLM. Same inputs → same next soul.

It imports the per-stage rule table from `src/stages` (already on main): `stageRules(stage) →
{ plasticity, stageSign, volatility }`. That dependency is why this brick waited for Brick 3.

## SCOPE — consolidation ONLY
IN: the nurture spring (room-bounded), the linear set-point pull, whole-bracket plasticity
scaling, the leaky accumulator decay, and sticky decay-floor atrophy. Plus the `GlobalKnobs` type.
OUT (these are Brick 5, a separate worktree — do NOT build them here): tension charge/leak,
breaking points, refractory windows, set-point (`s`) migration. Set points are FIXED in this brick.

## The update rule (SPEC §"Update rule (core math)", lines ~670–742) — implement exactly
For each aspect i, at consolidation:
```
drive = Aᵢ                                   # the leaky accumulator value (fast loop)
room  = (1 − vᵢ) if drive > 0 else vᵢ         # soft-bound the NURTURE force ONLY
vᵢ ← vᵢ + plasticity(stage) · [ α·drive·room  +  β_eff·stageSign·(sᵢ − vᵢ) ]
```
Decided invariants you MUST honor (not tunable, not negotiable):
- **`β_eff = β·(0.5 + stubbornness)`** — stubborn uls pull home harder, clay barely.
- **`stageSign`** comes from `stageRules(stage)` — it is **−1 in adolescence** (set-point pull
  inverts → repulsion: the ul is driven *away* from its nature), +1 elsewhere. Don't recompute it.
- **Linear state + selective saturation:** keep `vᵢ` linear in [0,1]. The **set-point spring
  pulls LINEARLY (un-room'd)** so it can reach ANY extreme set point (0.95 etc.). ONLY the
  **nurture force is room-bounded** (`·room`) so it can't overshoot the [0,1] edge. Add a tiny
  per-step rate cap + a final clamp to [0,1] as backstop. Do NOT use logit space.
- **Whole-bracket plasticity (load-bearing):** `plasticity(stage)` multiplies the *entire*
  bracket `[nurture + set-point pull]`. So old age (plasticity ≈ floor ≈ 0) **freezes the lived
  blend** — it does NOT snap back to the set point. This is the property that makes "old age is
  where it stays" true.

## Leaky accumulator (the fast loop)
The accumulator `A` is a leaky integrator with half-life `λ`: each step it decays toward 0 and
takes in new signal. `drive = Aᵢ` = `α·practice + β·fit` smoothed (per the SPEC note at line 674).
Implement the decay/update here (the raw practice/fit inputs are supplied by perception later — for
now accept them as function inputs / a per-step signal record). Document the half-life→decay mapping.

## Sticky decay-floor atrophy (SPEC §"Atrophy", lines ~722–735) — the subtle part
An aspect with **no observations this step does NOT revert toward its set point.** It HOLDS, with
at most a slight slump that **stops on its own**:
- When a disuse spell begins, snapshot the value as the anchor `v⁰ᵢ` (the Soul already has
  `disuseAnchor`). Atrophy decays `vᵢ` toward a **floor** `fᵢ = sᵢ + (1−κ)·(v⁰ᵢ − sᵢ)`.
- So disuse can erode **at most a fraction κ** of the lived deviation, then **asymptotes and
  halts**. You keep `(1−κ)` of what you built forever. κ is small (~0.15–0.25).
- **Anchor reset:** the moment an aspect is exercised again (drive ≠ 0), `v⁰ᵢ` resets to the
  current value. So a fresh disuse spell can only ever shave another κ off *the new* position —
  **it never compounds back to the set point.** This is the anti-reversion guarantee — get it right.
- Atrophy is **plasticity-scaled too**, so old age freezes even this slump.

## GlobalKnobs (define here as data; Brick 5 will read the rest)
Define the `GlobalKnobs` type/const with all ~9 globals: `α` nurture gain, `β` nature pull,
`λ` accumulator half-life, `ρ` tension leak, `θ` break threshold, `J` break base, refractory
length, atrophyRate, `κ` atrophy retention. This brick consumes α, β, λ, κ, atrophyRate; the
tension knobs (ρ, θ, J, refractory) are placeholders for Brick 5. Annotate magnitudes `// TUNABLE (Phase 3)`.

## Key files (expected)
- `packages/core/src/engine/index.ts` — `consolidate`, accumulator decay, atrophy, `GlobalKnobs`
- `packages/core/test/engine…` (or `consolidate.test.ts`) — the proof tests below

## Out of scope
- Tension / breaking points / refractory / set-point migration → Brick 5 (separate worktree).
  Keep `s` fixed; do not migrate it.
- `src/birth`, `src/mbti`, `src/stages` (consume `stageRules`, don't modify it), `src/state`
  (use the Soul type as-is; only add an engine-local type if truly needed).
- The untracked `docs/ul-*.html` and `scripts/ul-*.mjs` files.

## Proof (deterministic vitest — these encode the decided invariants)
- **Nurture toward bound:** sustained positive drive → `v` moves toward the relevant [0,1] bound,
  room-bounded so it never overshoots past 1 (or below 0 for negative drive).
- **Linear set-point reach:** with an extreme set point (e.g. s=0.95) and no drive, the pull can
  carry `v` all the way toward 0.95 (un-room'd) — proves the spring isn't saturation-killed.
- **Idle slump halts at the floor:** drive=0 over many steps → `v` decays toward
  `f = s+(1−κ)(v⁰−s)` and **asymptotes there — never reaches s.** Assert it stops above the floor.
- **Anchor reset / no compounding:** exercise an aspect (anchor resets), then idle again → it can
  only shave another κ off the NEW value, never walks back to s across repeated disuse spells.
- **Old age freezes:** old-adulthood plasticity ≈ 0 → `v` barely moves regardless of drive or pull.
- **Adolescence repels:** stageSign=−1 → the set-point term pushes `v` AWAY from `s`.
- **Stubbornness:** higher stubbornness → stronger homeward pull (β_eff scales as β·(0.5+stubbornness)).
- **Determinism:** same (soul, knobs, stage) → identical next soul.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE
SAME COMMIT: check off Brick 4 (and the GlobalKnobs bullet), advance the "Right now" line to
Brick 5 (Tension + breaking points). Add a `## Verification` block to this MISSION.md before
marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Update rule" + §"Atrophy & knobs" (lines ~670–742);
`docs/ARCHITECTURE.md` for the boundary contract (core stays pure).

## Verification
- Build: pass (`pnpm check` — boundaries clean, biome lint clean, `tsc -b` clean)
- Tests: pass (32 total: 17 new engine + 15 stages, all deterministic, vitest green)
- Scope kept: yes — consolidation + leaky accumulator + sticky atrophy + `GlobalKnobs` only.
  `s` left FIXED (no migration); tension/breaks/refractory (ρ/θ/J/refractory) defined as
  placeholders but NOT implemented (Brick 5). No edits to `stages`/`state`/`birth`/`mbti`.

Files:
- `packages/core/src/engine/index.ts` — `GlobalKnobs` + `DEFAULT_KNOBS`, `accumulatorDecay`,
  `charge` (fast loop), `consolidate` (slow loop: room-bounded nurture + linear set-point
  spring + sticky decay-floor atrophy, whole-bracket plasticity, anchor-reset guarantee).
- `packages/core/test/engine.test.ts` — 17 tests encoding the decided invariants.

## Status
Status: ready-to-merge
