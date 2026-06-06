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
- [ ] **Brick 1 — Birth seeding** (`src/birth`)
      `seedFromEntropy(entropy, now) → Soul`. Seeded PRNG + Box-Muller; per-aspect σ table +
      gender-d mean shifts + 50/50 sex + random stubborn↔clay.
      **Proof:** 10k-birth population test → distribution matches SPEC rarity targets
      (INTJ ~2%, ISFJ ~14%, S/N skew). Objective pass/fail.
- [ ] **Brick 2 — MBTI projection** (`src/state` or `src/mbti`)
      `aspects → 16-label readout` at the SPEC percentile thresholds. Pure, display-only.
      (Needed to score Brick 1's rarities, so it lands with birth.)
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
- [ ] **Brick 5 — Tension + breaking points** (`src/engine`)
      tension charge/leak, threshold + refractory, clay reconfigures / stubborn hardens,
      capped set-point migration. Pure.
- [x] Define `GlobalKnobs` (α, β, λ, ρ, θ, J, refractory, atrophyRate, κ) as data.
      Done in `src/engine` (`GlobalKnobs` + `DEFAULT_KNOBS`): Brick 4 consumes α/β/λ/κ/atrophyRate;
      ρ/θ/J/refractory are placeholders Brick 5 reads.

## Phase 2 — Simulator (`tools/simulator`)
- [ ] `lifetime(seed, sessionScript[], knobs) → trajectory` — drive scripted ledgers through
      Phase 1, no LLM.
- [ ] **Acceptance test (SPEC):** same seed, two usage patterns (aligned vs mismatched grind)
      → two genuinely different adults, with a narratable "why."

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
**Next brick: Phase 1 · Brick 5 — Tension + breaking points** (`src/engine`).
Brick 4 (consolidation) is in — it consumes the Brick 3 stage table and the `GlobalKnobs`
data. Brick 5 layers tension charge/leak onto the fast loop, then the threshold + refractory
breaking point (clay reconfigures / stubborn hardens) and the rare capped set-point migration —
reading the ρ/θ/J/refractory placeholders already defined in `GlobalKnobs`. Note: Brick 1 (birth
seeding) and Brick 2 (MBTI projection) are still stubs — pick them up alongside.
