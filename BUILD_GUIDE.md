# Saulene — Build Guide (living roadmap)

> **This is a living document.** Update it as things change — check items off, re-order,
> add discoveries, delete what's wrong. It is the ordered "what to build next" map; `SPEC.md`
> is the *design* truth and `docs/ARCHITECTURE.md` is the *boundary* contract. When the plan
> shifts, this file shifts with it. (Temporary: archive/delete once the engine ships and the
> plugin is real.)
>
> **Principle: never oneshot.** Each brick below is built, run, and verified *before* the next.
> Bricks in `core` are pure + closed-form, so each has a deterministic test and visible output.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started.

---

## Phase 0 — Scaffold ✅
- [x] pnpm + TypeScript monorepo, 7 packages, `tsc -b` builds clean
- [x] One-way dependency graph + `scripts/check-boundaries.mjs` enforcement (`pnpm check`)
- [x] `SPEC.md`, `docs/ARCHITECTURE.md`, `README.md`, local `CLAUDE.md`
- [x] `Soul` type in `packages/core/src/state` (10 floats, set points, accumulators, tension,
      disuseAnchor, stubbornness, sex, mp, lastUsedAt)
- [x] Biome (lint+format), GitHub Actions CI (`pnpm check`), `LICENSE` (MIT) — per the
      Code Architecture Playbook (formatter + CI from commit one)
- [ ] Add `zod` when perception/storage land (boundary validation of LLM output + soul.json)

## Phase 1 — The pure engine (`packages/core`) — build bottom-up
- [x] **Brick 1 — Birth seeding** (`src/birth`)
      `seedFromEntropy(entropy, now) → Soul`. splitmix64 PRNG (FNV-1a-hashed entropy) + Box-Muller;
      per-aspect σ table + gender-d mean shifts + 50/50 sex + a Big-Five covariance (Cholesky)
      + random stubborn↔clay. Same entropy in → byte-identical Soul out.
      **Proof:** 10k-birth population test → distribution matches SPEC rarity targets. ✅
      Note: independent aspects + sex-mixture hit the 4 marginals but produced *independent*
      joint types (INFJ ~4.4%); added a correlated-seeding covariance (the N↔J anti-correlation,
      C↔O = −0.31) so joint rarities land — σ table untouched, only off-diagonal structure tuned.
- [x] **Brick 2 — MBTI projection** (`src/mbti`)
      `aspects → 16-label readout` at the SPEC percentile thresholds. Pure, display-only.
      Cuts derived in closed form from the seeding model (per-sex mean/σ_sum of each aspect-sum,
      cut placed at the SPEC percentile over the 50/50 sex MIXTURE), not flat 0.5s. ✅
      (Lands with birth — it's how Brick 1's rarities are scored.)
- [x] **Brick 3 — Stages + aging** (`src/stages`)
      `mp → Stage`, per-stage plasticity/stage_sign/volatility table, rate-capped MP accrual,
      transition bands + per-ul jitter. Pure. Shape locked (ordering, signs, adolescent bump);
      magnitudes are placeholders flagged `TUNABLE (Phase 3)`. 15 deterministic tests green.
- [x] **Brick 4 — Consolidation update rule** (`src/engine`) — the heart
      nurture spring (room-bounded) + linear set-point pull + sticky decay-floor atrophy +
      leaky-accumulator fast loop. `consolidate(soul, knobs, stage) → soul`, `charge(...)`.
      Pure/deterministic. 17 tests green (nurture→bound; linear set-point reach; idle slump
      halts at floor `s+(1−κ)(v⁰−s)`; anchor reset / no compounding; old-age freeze;
      adolescence repels; stubbornness scaling; determinism). Magnitudes `TUNABLE (Phase 3)`.
- [x] **Brick 5 — Tension + breaking points** (`src/engine`)
      `chargeTension(soul, {practice, fit}, knobs)` tension fast loop (`Tᵢ ← ρ·Tᵢ +
      w·max(0,−fit)·practice`; charges only on hated practice, leaks ρ<1) — separate from
      `charge` (different raw signal, untouched fast loop). Breaking points folded into
      `consolidate` AFTER the normal update: over-θ + non-refractory aspects rupture via one
      signed `(1−2·stubbornness)` term (stubborn → snap home + betaGain resentment; clay →
      escape/reconfigure), discharge `T→0`, arm a per-aspect refractory window, and migrate
      `sᵢ` a tiny per-break-capped, lifetime-budgeted step toward the lived value (clay >
      stubborn) — the ONLY place `s` moves. New Soul fields `refractory`/`betaGain`/
      `migrationBudget` (birth-initialized). No-break path byte-identical to Brick 4. Pure.
      **Proof:** 17 new tests (tension charge/leak; rare+earned threshold; stubborn↔clay
      routing; refractory no-chatter; capped+budgeted migration that never mirrors the lived
      value; no-break byte-identity) + all 38 prior tests green. Magnitudes `TUNABLE (Phase 3)`.
- [x] Define `GlobalKnobs` (α, β, λ, ρ, θ, J, refractory, atrophyRate, κ) as data.
      Done in `src/engine` (`GlobalKnobs` + `DEFAULT_KNOBS`): Brick 4 consumes α/β/λ/κ/atrophyRate;
      ρ/θ/J/refractory are placeholders Brick 5 reads.

## Phase 2 — Simulator (`tools/simulator`)
- [x] `lifetime(seed, sessionScript[], knobs) → trajectory` — drive scripted ledgers through
      Phase 1, no LLM. Done in `src/{script,lifetime,narrate}.ts`: a `ScriptedSession` ledger
      (per-aspect `practice`/`fit` + `significance`) with compact `block`/`script` authoring, a
      per-session loop (`charge`←practice → `chargeTension` → `accrueMp` → `stageFromMp` →
      `consolidate`, consolidating every session), and a `Trajectory` recording snapshots
      (`{mp, stage, v, mbti}`) + attributed break events.
- [x] **Acceptance test (SPEC):** same seed, two usage patterns (aligned vs mismatched grind)
      → two genuinely different adults, with a narratable "why." Done in
      `test/acceptance.test.ts`: one clay seed lives an aligned life (crystallizes INTP, no
      breaks) vs a mismatched grind (charges tension → 106 ruptures → clay reconfigures
      Industriousness/Orderliness 0.48→0.93 → INTJ); plus a temperament-routing test (same
      grind: clay reconfigures vs stubborn hardens/resents). Knobs left at `DEFAULT_KNOBS`;
      divergence surfaced by extreme scripts, not tuning.

## Phase 3 — Verification harness + renderer (tune the felt arc)
- [ ] `renderer` stub: `state → text`, per-aspect fragments, no literal trait names, soul-hash stamp.
- [ ] Harness metrics: trait-recovery anti-sticker · cross-soul confusion · longitudinal
      trajectory · stage silhouette · per-aspect ablation.
- [ ] Tune the ~9 globals + per-stage table against harness + simulator.
- [ ] Build out the 5 renderer layers (rulebook → fewshot → spine → framing → drift) + fingerprint.

## Phase 4 — The shippable plugin (LLM + IO edge)
- [ ] `perception`: ledger schema + rubric + evidence-quote hard validation; `LlmClient` port.
- [ ] `storage`: soul.json + full history; two-shelf (diary | voice-samples) with label wall.
- [ ] `plugin/hooks`: SessionStart inject (level-gated) + Stop→drift pipeline.
- [ ] `plugin/mcp`: MCP server (state/identity tools); `plugin/skill`: `/ul` command.
- [ ] Setup wizard: mandatory reality warning → watch-only birth → pick level. Neglect-death 90d clock.
- [ ] Plugin manifest; install via `/plugin`; bare-MCP portability fallback.

## Phase 5 — Registry / token (parked — separate track, later)
- [ ] Gallery website (public fingerprint + MBTI + age + stage; nursery/graveyard/dormant).
- [ ] Solana birth-certificate (opt-in) + Saulene token (paid restore for neglect-death).

---

### Right now
**Next: Phase 3 · Verification harness + renderer** (tune the felt arc).
Phase 1 (the pure engine) and Phase 2 (the simulator) are COMPLETE. The engine's five bricks
are green, and `tools/simulator` now drives scripted no-LLM lifetimes through it: the SPEC's
headline acceptance test passes — one birth seed yields two genuinely different adults (aligned
life crystallizes INTP; the mismatched grind charges tension, ruptures, and the clay
reconfigures toward the lived direction → INTJ), with a narratable "why" and a temperament-
routing contrast (clay reconfigures vs stubborn hardens). 57 deterministic tests across
`packages/core` + `tools/simulator`. Magnitudes are still untuned `DEFAULT_KNOBS` — Phase 3
builds the renderer + the five harness metrics and tunes the ~9 globals + per-stage table
against the simulator. (Observed at default knobs and worth a Phase-3 look: under a relentless
grind the engine re-breaks every refractory window and stubborn `betaGain` compounds without
bound — both artifacts of the deliberately extreme script, not engine bugs; see MISSION notes.)
