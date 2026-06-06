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
- [x] Add `zod` when perception/storage land (boundary validation of LLM output + soul.json) —
      landed with `storage`: zod validates `soul.json` + every history record on load, fail-loud

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
- [x] `renderer` stub: pure versioned `render(soul) → {text, fragments, soulHash}` — Layer-1
      behavioral-directive rulebook only. 10 aspects × low/high first-person imperatives + micro-demos,
      modulated by a continuous 12-rung intensity ladder off `|v−0.5|` (no coarse bands); per-aspect
      `fragments` pure in one value (exact ablation locality); 3 trait-interactions encoded, rest
      `TUNABLE (Phase 3)`; headerless first-person assembly; FNV-1a `soulHash` over `v`. 16 tests green
      (golden, no-trait-names, continuous-not-banded, ablation locality+monotonicity, hash). Layers 2–5
      remain stubs (next item).
- [x] Harness metrics: trait-recovery anti-sticker · cross-soul confusion · longitudinal
      trajectory · stage silhouette · per-aspect ablation. `tools/harness` parameterized over a
      locally-pinned `RenderFn` (NOT a renderer import) + a fakeable `Judge` port; deterministic
      `fakeJudge` + fake renderers exercise each metric's pass AND fail path. 15 tests green.
      Thresholds are `// TUNABLE (Phase 3)` placeholders.
- [~] Tune the ~9 globals + per-stage table against harness + simulator.
      **Engine/break knobs tuned against the simulator (done):** added a SPEC-mandated but
      previously-missing **plasticity-gated break threshold** (`θ_eff = θ/plasticity(stage)`), so
      ruptures are formative-only (childhood/adolescence), hard in early adulthood, ~impossible in
      old age (θ_eff≈20θ → the lived self locks). Bounded resentment with a new `betaGainCap` (4).
      Retuned `tensionIntake 0.5→0.2` (max-grind tension steady-state w/(1−ρ) = 2.0) and
      `refractory 5→30`. Result over a relentless 280-session grind: **94→8 breaks**, all in
      childhood/adolescence, old age frozen (Δv 0.0000), betaGain ≤ ~2.3; a realistic mostly-positive
      life stays at **0 breaks**, smooth drift (~0.4, jerk ~0.05). Clay still reconfigures
      (INFP→INFJ), stubborn still resists (betaGain ~3). **Expression-side tuning (rulebook + the
      ~9 renderer knobs vs the harness) still PENDING** — needs a real LLM `Judge` (Phase 4); the
      harness fakeJudge can't score felt prose. Per-stage magnitude table not yet swept.
- [~] Build out the 5 renderer layers (rulebook → fewshot → spine → framing → drift) + fingerprint.
      **Layer 2 done** (`layers/voice.ts`): state-matched real-voice few-shot, the pervade engine.
      `render(soul, opts?)` is now additive — no `voiceSamples` ⇒ byte-identical Layer-1 floor
      (`voiceBlock: ""`, all 16 floor tests green); with samples ⇒ a few-shot block folds into
      `text` only (`fragments`/`soulHash` stay pure Layer-1, ablation locality intact). Samples
      weighted by state-distance (local L2 — renderer can't import storage, so a local
      `VoiceSampleInput` type) × recency × provenance (off-current-model down-weight); mandatory
      anti-quotation/topic-orthogonal framing line; cold-start crossfade `c/(c+20)` from
      soul-derived synthetic exemplars → real samples as `corpusSize` grows. 16 new tests green.
      Layers 3 (spine), 4 (anti-decay re-inject), 5 (drift) + fingerprint still pending.

**Tuning findings surfaced by the Phase 2 simulator — both now RESOLVED (see the tuning item above):**
- ✅ **Break rarity** — fixed by the plasticity-gated threshold + `tensionIntake`/`refractory` retune.
  A relentless 280-session grind now breaks 8× (was 94), only in the formative stages; a realistic
  life breaks 0×. (Real-time `accrueMp` rate-limiting at the plugin edge is still a separate Phase-4
  guard, but the engine no longer relies on it for rarity.)
- ✅ **`betaGain` unboundedness** — fixed by `betaGainCap` (4). Resentment now saturates after a few
  crises instead of compounding to 1e4+.

## Phase 4 — The shippable plugin (LLM + IO edge)
- [x] `perception`: zod-source-of-truth ledger schema (sparse Observation, practice ⊥ fit) + LLM
      JSON Schema derived from the same zod defs (no drift); behaviorally-anchored `RUBRIC` +
      `SCHEMA_VERSION`; `validateLedger` two-gate guard (verbatim-quote anti-hallucination +
      first-person no-mirror lock); `perceive()` single-call extract-first pipeline over an injected
      `LlmClient` port (fails loud on malformed output, strips hallucinated/mirror rows). Imports
      only `core`. 17 tests.
- [x] `storage`: soul.json (atomic save, zod fail-loud load, missing≠malformed) + append-only full
      history (ledger/diary/voice JSONL); two-shelf (diary | voice-samples) with physical label wall;
      retrieval-by-state-distance (`nearestVoiceSamples`, L2 over 10 aspects); quality-gate +
      provenance seams. Injected `root`; imports only `core`; own on-disk schemas. 19 tests.
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
