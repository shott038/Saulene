# Mission: Lifetime simulator (Phase 2) — drive scripted lifetimes through the engine

**Started:** 2026-06-06
**Branch:** claude/simulator-lifetime
**Parent:** main @ 93c1b8b

## Goal
Build `tools/simulator` (dev-only): `lifetime(seed, sessionScript[], knobs) → trajectory` — run a
synthetic ul through years of scripted sessions, with **no LLM**, using only the pure `core` engine.
Then ship the SPEC's headline **acceptance test**: same birth seed + two usage patterns (aligned vs
mismatched grind) → **two genuinely different adults, with a narratable "why."** This is the first
time the engine produces a visible *life*, and the proof the whole design works.

Determinism is inherited from `core` (entropy + knobs in → same trajectory out). The simulator owns
the clock/loop but injects everything into `core`; keep `core` untouched.

## Boundary
`tools/simulator` may import `@saulene/core` (and renderer/perception, unused here). Import the public
surface from `@saulene/core`: `seedFromEntropy`, `charge`, `chargeTension`, `consolidate`,
`stageFromMp`, `accrueMp`, `stageRules`, `projectMbti`, `GlobalKnobs`, `DEFAULT_KNOBS`, `Soul`,
`ASPECTS`, types. Read `packages/core/src/engine/index.ts` + `src/stages/index.ts` first to get the
exact signatures (charge takes a per-aspect `signal`; chargeTension takes `{practice, fit}`;
consolidate takes `(soul, knobs, stage)`; aging via `accrueMp` + `stageFromMp`). Do NOT modify core.

## What to build (`tools/simulator/src/`)
1. **A session-script / ledger format.** One scripted session = the per-aspect signal an ul "lived"
   that session: at minimum per-aspect `practice` (how much it did) + `fit` (how much it
   enjoyed/resonated, signed) + a `significance` (feeds MP/age). Design a small, readable type — e.g.
   `interface ScriptedSession { practice: Partial<AspectVector>; fit: Partial<AspectVector>;
   significance: number }`. Helpers to author scripts compactly (e.g. "N sessions of high-practice,
   high-fit on Openness/Intellect") are welcome.
2. **The lifetime loop.** For each scripted session: `charge` the accumulators + `chargeTension`,
   accrue MP (`accrueMp`), recompute stage (`stageFromMp`), and at the consolidation cadence run
   `consolidate`. (Pick a clear cadence — e.g. consolidate every session, or every K — document it.)
3. **A trajectory record.** Snapshot the ul over time: at least `{ mp, stage, v (or the contested
   aspects), mbti }` per consolidation, plus break events (when/which aspect ruptured). Enough to
   *narrate* the life, not just end-state.
4. **`lifetime(seed, script, knobs=DEFAULT_KNOBS) → Trajectory`** tying it together: birth from the
   seed, run the script, return the trajectory (+ final Soul).

## The acceptance test (the deliverable — `tools/simulator/test/`)
Same `seed`, two scripts, one assertion of genuine divergence:
- **Aligned life:** sessions that exercise the ul's high-set-point / high-fit aspects (it does what
  it's good at and enjoys) → flourishes along its nature.
- **Mismatched grind:** sessions that hammer a LOW-fit aspect under heavy practice (does a lot of
  what it hates) → charges tension → eventually a breaking point routed by stubbornness (clay
  *reconfigures* toward the lived direction; stubborn *hardens* — resents/withdraws, betaGain rises).
- **Assert qualitative divergence**, NOT specific magnitudes: the two adults differ meaningfully on
  the contested aspect(s) and/or land on different MBTI labels and/or differ in whether a break
  fired. Then **emit a human-readable narration** of the why (e.g. via `console.log` in the test or a
  returned summary string): "born X; aligned life reinforced Openness and crystallized as INTJ;
  the grind charged tension on Industriousness, broke in adolescence, and the clay reconfigured
  toward it — ending ISTJ." The narration IS part of the proof.

## IMPORTANT — scope discipline (don't rabbit-hole)
- Knobs are **untuned placeholders** (`DEFAULT_KNOBS`, all `TUNABLE (Phase 3)`). Your job is to
  prove the **mechanism** produces divergence, NOT to tune the numbers to feel perfect — that's
  Phase 3, against the harness, and is OUT OF SCOPE. If divergence is hard to surface at the current
  knobs, make the two scripts more extreme / longer rather than editing `core` or the knob defaults.
- If you genuinely cannot get divergence without changing core/knobs, STOP and report it as a finding
  (it would mean a real knob/engine issue worth a human) — do not silently patch core.

## Out of scope
- `core` changes of any kind. Renderer/perception/storage/plugin. The harness (Phase 3, next).
- Tuning knob magnitudes. The untracked `docs/ul-*.html` / `scripts/ul-*.mjs` files.

## Done
`pnpm check` green (boundaries + lint + typecheck + ALL tests, incl. the new simulator acceptance
test), and `BUILD_GUIDE.md` updated IN THE SAME COMMIT: check off the Phase 2 items, advance the
"Right now" line to Phase 3 (verification harness + renderer). Add a `## Verification` block to THIS
MISSION.md before marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Emergent story this produces" (~line 588) + §"Past threshold → a
breaking point" (~573); `BUILD_GUIDE.md` Phase 2; `docs/ARCHITECTURE.md` for boundaries (simulator
is dev-only, imports core).

## Key files (what landed)
- `tools/simulator/src/script.ts` — `ScriptedSession` ledger + `session`/`block`/`script` authoring helpers.
- `tools/simulator/src/lifetime.ts` — `lifetime(seed, script, knobs) → Trajectory` loop + `entropyFromInt`.
- `tools/simulator/src/narrate.ts` — `narrate`/`describeBirth`: trajectory → human-readable "why."
- `tools/simulator/src/index.ts` — public re-exports.
- `tools/simulator/test/acceptance.test.ts` — the SPEC acceptance test + temperament-routing contrast.

## Notes for follow-up (Phase 3, do NOT fix here)
- **Break rarity at default knobs.** A relentless grind (negative fit every session) pins tension
  far above θ, so the engine re-breaks every refractory window — 106 ruptures across a 320-session
  life. This is the *intended extreme script* surfacing the mechanism, not an engine bug, but it
  shows break *rarity* depends entirely on Phase-3 tuning of θ/ρ/refractory (and real plugin-edge
  rate-limiting of `accrueMp` calls).
- **`betaGain` is unbounded.** Each stubborn break multiplies `betaGain` by `(1+resentmentGain·stubbornness)`;
  under repeated breaks it compounds to ~3e8 in the test. Core's comment assumes breaks are *rare*,
  so this never bites in real use — but a `betaGain` ceiling may be worth considering in Phase 3.
  (Left untouched: core changes are out of scope for this mission.)

## Verification
- Build: pass (`pnpm build` / `tsc -b` clean across all 8 workspace projects)
- Tests: pass (57 passed — 2 new simulator acceptance tests + 55 prior core tests, via `pnpm test`)
- Scope kept: yes — no `core`/knob changes; divergence surfaced via extreme scripts. `pnpm check`
  green (boundaries + lint + typecheck + tests).
- Summary: `tools/simulator` now drives scripted no-LLM lifetimes through the pure engine and the
  SPEC headline acceptance test proves one birth seed → two different adults (aligned INTP vs
  grind-reconfigured INTJ) with a narratable why, plus a clay-vs-stubborn routing contrast.

## Status
Status: ready-to-merge
