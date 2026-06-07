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
- [x] **A/B behavioral validation (the proof-of-life run)** — DONE, subscription-only (Claude Code
      `claude -p`, no metered API). Real LLM Judge + A/B + salience + identification suite landed in
      `tools/harness` (see `FINDINGS.md`, `AB-FINDINGS.md`, `SALIENCE-FINDINGS.md`, `IDENT-FINDINGS.md`).
      **VERDICT: the central bet holds.** The renderer encodes graded, **bidirectional** behavioral
      identity; what surfaces is **context-dependent** (analytical traits on work tasks, warmth on
      emotional ones — warm-true 0.22–0.33 on neutral prompts → **0.72–0.89** on emotional prompts).
      The early Phase-2 lift-null + Phase-4/5 "cold-only" were measurement/battery artifacts (noisy
      `recoverTraits`, near-neighbor souls, a coding-heavy battery), NOT an inert renderer. Two
      actionable wins: (1) **deliver at S1** (voice in the conversation channel) — noticeability
      0.33→0.71 vs the current append-to-system; (2) **empirical base-Claude persona `r_B`** (not 0.5)
      is the correct harness baseline (committed in `judge.ts`). Honest product framing: "the ul
      colors how Claude engages, context-appropriately." Full design: `docs/ab-validation-plan.md`.
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

- [x] **The look — the terminal ul sprite** (renderer's second surface; see SPEC → Expression → the *look*).
      The ul is a cloud-spirit sprite drawn in the user's terminal/statusline. **Visual design LOCKED (Jun 6):**
      canonical geometry (`scripts/ul-geometry.mjs` + `docs/ul-default.svg`), the 8 idle wisp variants, the
      idle engine (breathing + gestures + 2:15 swap + twinkle easter-egg), all 9 reactive animations
      (prompt/thinking/success/error/retry/response/ctx-filling/ctx>80%/compaction), the **director**
      (mode+pulse conflict resolution, proven in `docs/ul-session.gif`), and the **birth animation**
      (`scripts/build-ul-birth.mjs`). Terminal rasterizer (truecolor half-blocks) exists in `scripts/`.
      **Pure core formalized (Jun 6, `sprite-formalization` branch):** `packages/renderer/src/sprite/`
      is now a pure, golden-tested `Soul → SpriteParams` module (`geometry.ts` + `index.ts`) — all 10
      aspects + stage + birth-entropy jitter resolved into typed visual params, with `SPRITE_EXCLUSIVE`
      documenting the ablation contract (bidirectionally enforced), plus monotonicity/stage/seed/hash
      tests. 43 tests green; imports only `core`. **Still left (Phase-4 statusline):** the terminal
      rasterizer (truecolor half-blocks, prototyped in `scripts/`) + promoting the DEMO-only director
      to the runtime engine driven by real Claude Code hooks. Provenance: prototyped in the
      `viz-exploration` worktree; keepers documented in `NOTES.md`.

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
- [x] `plugin/hooks`: SessionStart inject (level-gated) + Stop→drift pipeline. SessionStart =
      gate → load soul (`storage`) → neglect-death check → `render` → inject level-gated voice;
      Stop = `perceive` → signal-convert → charge → `core` consolidate → persist. Real
      `AnthropicLlmClient` (`llm.ts`, haiku, temp=0) behind the `perception` port; all deps injected
      (`storageRoot`, `llm`, `now`) so the 29 tests use zero real IO. Imports everything; `core` stays
      pure. 212/212 workspace tests green, boundaries clean.
- [x] `plugin/mcp`: MCP server (read-only state/identity tools — `ul_snapshot`, `ul_drift`,
      `ul_countdown`) + `plugin/skill`: `/ul` command. Both share one read path (`mcp/snapshot.ts`)
      over the existing `storage` loaders + `core` projections (MBTI/stage/age); zero soul mutation
      (drift stays in the Stop hook). Server is a factory (`bin.ts` = stdio entry, not auto-started,
      not on the public surface). 14 new tests; 281/281 workspace green.
- [x] `plugin/statusline`: the live terminal ul. Truecolor half-block rasterizer
      (`rasterizer.ts`: `compose() → PixelGrid` + `pixelGridToAnsi()` + HSL→RGB from the renderer's
      `SpriteParams`) + the runtime **director** (`director.ts`: `AnimDirector.signal()`/`tick()` with
      full mode/pulse/gesture conflict-resolution) promoted from the demo-only `scripts/`. Driven by
      real session signals; locked pixel-art bodies + 8 wisp variants + gestures/breathing in
      `sprite-data.ts`; birth animation (`birth.ts`) plays on first install; `statusline.ts` runtime
      = setInterval loop + `signal()` surface for hooks. Consumes the pure renderer sprite; `core`/
      `renderer` stay pure, all IO at the plugin edge. 55 tests; 267/267 workspace green.
- [ ] Setup wizard: mandatory reality warning → watch-only birth → pick level. Neglect-death 90d clock.
- [ ] Plugin manifest; install via `/plugin`; bare-MCP portability fallback.

## Phase 5 — Registry / token (parked — separate track, later)
- [ ] Gallery website (public fingerprint + MBTI + age + stage; nursery/graveyard/dormant).
- [ ] Solana birth-certificate (opt-in) + Saulene token (paid restore for neglect-death).

---

### Right now
**The central bet is VALIDATED — finish the shippable plugin.**
The full engine + expression path is built and live behind real hooks (`perception`, `storage`,
`plugin/hooks`, `plugin/statusline`, `plugin/mcp` + `/ul`), and as of Jun 6 the **A/B behavioral
validation suite** (subscription-only, in `tools/harness`) has answered the proof-of-life question:
**the ul demonstrably changes Claude's behavior — graded and bidirectional — surfacing
context-appropriately** (analytical on work tasks, warm on emotional ones; warm-true 0.22–0.33 →
0.72–0.89 when the prompt gives warmth room). Early nulls were measurement artifacts, not an inert
renderer. See the four `tools/harness/*FINDINGS.md` docs.

Two validated improvements to fold into the product:
1. **Switch hook delivery to S1** — inject the voice into the conversation channel, not only
   appended to Claude Code's ~20k-token system prompt (measured noticeability 0.33 → 0.71).
2. **`r_B` baseline** — the empirical base-Claude persona replaces the assumed 0.5 (done in harness).

Remaining bricks to ship:
1. ✅ **S1 delivery (DONE)** — `plugin/hooks` now delivers the voice via a **`UserPromptSubmit`**
   hook (per-turn `additionalContext`, the S1 conversation-channel position), not SessionStart's
   system-prompt context. SessionStart now does gating + renders-and-caches (`session-cache.ts` →
   `session-injection.json`) + `lastUsedAt` bump and returns null; `user-prompt-submit.ts` reads the
   cache cheaply each turn. Gating/neglect-death/drift all intact. **Manifest must wire BOTH hooks**
   (SessionStart for side-effects only — do NOT use its return as additionalContext; UserPromptSubmit
   for the voice). 291/291 green.
2. ✅ **Setup wizard (DONE)** — `plugin/src/setup/wizard.ts`: 3 beats (reality-warning + ack gate →
   watch-only birth [seed soul → persist → birth animation] → pick level + `saveConfig`). 90d clock
   coherent end to end (birth sets `lastUsedAt`; SessionStart checks/resets). `runWizard` exported
   for the manifest. Fully dep-injected; 305/305 green.
3. ✅ **Plugin manifest (DONE)** — `.claude-plugin/plugin.json` + `hooks/hooks.json` (SessionStart
   side-effects / UserPromptSubmit voice / Stop drift) + `.mcp.json` (MCP + bare-MCP standalone
   fallback) + `skills/ul` + `skills/ul-setup` + `src/bin/*` CLI wrappers incl. the interactive
   `setup.js` (drives `runWizard` via readline + plays the birth animation). 305/305 green.

**→ The plugin is COMPLETE and installable.** Engine → perception → storage → hooks (S1 delivery) →
statusline → MCP/`/ul` → wizard → manifest, with the central bet validated (the ul demonstrably,
context-appropriately changes Claude's behavior). Install via `/plugin`; first run `/ul-setup`.

**Still open (lower priority, not blocking ship):** the `[~]` Phase-3 renderer items — text Layers
3–5 (spine/framing/drift) + fingerprint, and the per-stage magnitude sweep. The harness + real
Judge to drive them now exist.
