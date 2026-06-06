# Mission: Verification harness (Phase 3) — the five metrics that tune expression

**Started:** 2026-06-06
**Branch:** claude/harness-metrics
**Parent:** main @ 4ca1476

## Goal
Build `tools/harness` (dev-only): the five verification metrics that score whether rendered
expression actually encodes the soul — the instrument every renderer layer gets tuned against.
Drive replayed synthetic lifetimes (from `@saulene/simulator`, already on main) through a renderer
and a judge, and compute the metrics. **This is the uncontested piece — build it well.**

## CRITICAL — stay decoupled from the renderer (so you build green in parallel)
A renderer worker is building `packages/renderer` in parallel; on `main` it is still an empty stub.
**Do NOT hard-import the renderer's concrete `render`.** Instead the harness is **parameterized**
over a `RenderFn` (injected) and tested with a **fake renderer**. Declare the pinned interface
locally so you compile + test independently; the real renderer wires in later at the tuning step.

### Pinned renderer↔harness contract (declare this shape locally; the renderer ships the same)
```ts
import type { Soul, Aspect } from "@saulene/core";
export interface RenderedInjection {
  text: string;                        // first-person injection, NO literal trait names
  fragments: Record<Aspect, string>;   // per-aspect — ablation targets one trait
  soulHash: string;                    // deterministic replay stamp
}
export type RenderFn = (soul: Soul) => RenderedInjection;
```

## The Judge port (injected + fakeable — keeps the harness testable with no real LLM)
Define a `Judge` interface the metrics call, injected so tests pass a deterministic fake and the
real LLM judge wires in at Phase 4. Include exactly the capabilities the five metrics need, e.g.:
```ts
export interface Judge {
  /** Recover the 10 aspect values [0,1] from prose alone (trait-recovery metric). */
  recoverTraits(prose: string): Promise<Record<Aspect, number>>;
  /** Pick which candidate soul authored this prose (cross-soul confusion). */
  guessAuthor(prose: string, candidateIds: string[]): Promise<string>;
  /** Embed text → vector (trajectory + stage-silhouette metrics). */
  embed(text: string): Promise<number[]>;
}
```
Ship a `fakeJudge` (deterministic) for tests — e.g. one that reads the injected fragments/soulHash
to behave like an ideal or a deliberately-stickered judge, so each metric's pass AND fail path is
exercised. The judge is async; metrics are async.

## The five metrics (SPEC §"Verifying expression — the harness", lines ~494–505)
1. **Trait-recovery / anti-sticker** (core): strip nothing-but-prose → `judge.recoverTraits` →
   compare to the true soul. If recovered traits sit at default-Claude baseline distance (no signal),
   raise a **sticker alarm**. Return per-aspect recovery error + the alarm flag.
2. **Cross-soul confusion matrix:** N souls × one fixed prompt battery → prose → `judge.guessAuthor`.
   Build the confusion matrix; a **high diagonal** = distinct voices. Return the matrix + diagonal rate.
3. **Longitudinal trajectory:** embed transcripts at dense timepoints along a lifetime → require net
   day-1→year-2 displacement **above** a perceptibility threshold AND step-to-step distance **under**
   a jerk threshold (continuous drift, not a teleport). Return both measures + pass/fail.
4. **Stage silhouette:** embed prose grouped by life-stage → stages must **cluster** (high silhouette
   score) and read distinct same-stage vs different-stage. Return the silhouette score per stage.
5. **Per-aspect ablation sensitivity:** perturb ONE aspect ±0.10 holding the rest fixed, re-render,
   measure voice shift → must move **monotonically + proportionally** (the "numbers drive prose"
   guarantee). Return per-aspect sensitivity + a monotonicity check.

Use a **fixed versioned prompt battery** (a small constant set of prompts) and the `soulHash` for
replay identity. Thresholds are `// TUNABLE (Phase 3)` placeholders — pick sane defaults.

## What to build (`tools/harness/src/`)
- `judge.ts` — the `Judge` port + a deterministic `fakeJudge`.
- `metrics/` (or one file) — the five metric functions, each `(inputs, render: RenderFn, judge: Judge)
  → result`, pure aside from the injected async judge. Pull lifetimes via `@saulene/simulator`'s
  `lifetime(...)` for trajectory/stage inputs; mint souls via `@saulene/core` `seedFromEntropy`.
- `battery.ts` — the fixed versioned prompt battery.
- `index.ts` — public exports + a `runHarness(render, judge, opts)` that runs all five.

## Out of scope
- The real LLM judge implementation (Phase 4 wiring) — only the port + a fake here.
- Any `core` / `simulator` / `renderer` change — consume their public surfaces only. Do NOT add a
  hard dependency on the renderer package compiling (parameterize over `RenderFn`).
- Tuning the actual knobs/rulebook — that's the interactive pass AFTER this + the renderer land.
- The `viz-exploration` sprite code.

## Proof (deterministic vitest with the fake renderer + fake judge)
- Each metric runs end-to-end on a fake renderer + `fakeJudge` and returns its shape.
- **Trait-recovery fires correctly:** an ideal fake renderer → low recovery error, no alarm; a
  deliberately-stickered fake renderer (ignores the soul) → baseline distance → alarm raised.
- **Cross-soul:** distinct fake voices → high diagonal; identical fake voices → low diagonal.
- **Ablation:** a fake renderer that responds to one aspect → monotonic sensitivity detected; one
  that ignores it → flat/zero sensitivity flagged.
- Determinism: fixed seeds + fakeJudge → identical metric outputs across runs.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE
SAME COMMIT: check off the "Harness metrics" item in Phase 3. Add a `## Verification` block to THIS
MISSION.md before marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Verifying expression — the harness" (lines ~487–510);
`docs/ARCHITECTURE.md` (harness is dev-only; may import core/renderer/perception/simulator — but
parameterize over RenderFn rather than hard-importing renderer so you build green in parallel).

## Key files (built)
- `tools/harness/src/render.ts` — the locally-pinned `RenderFn` / `RenderedInjection` contract.
- `tools/harness/src/judge.ts` — the `Judge` port, `BASELINE`, the fake codec, deterministic `fakeJudge`.
- `tools/harness/src/battery.ts` — the fixed versioned prompt battery (`battery-v1`).
- `tools/harness/src/metrics.ts` — the five metric functions + tunable thresholds.
- `tools/harness/src/index.ts` — public exports + `runHarness(render, judge, opts)`.
- `tools/harness/test/{fakes.ts,metrics.test.ts}` — fake renderers + 15 deterministic tests.

## Verification
- Build: pass (`tsc -b` clean across the workspace)
- Tests: pass (72 passed: 15 new harness tests + 57 prior, via `pnpm check`)
- Scope kept: yes — no core/simulator/renderer changes; parameterized over `RenderFn` (no renderer
  import); declared `@saulene/renderer`/`@saulene/perception` deps left in place (allowed by the
  boundary graph) but never imported, so the harness builds green while the renderer is still a stub.
- Summary: `tools/harness` ships all five expression metrics + a fakeable Judge port, proven on a
  fake renderer + deterministic fake judge across each metric's pass AND fail path.

## Status
Status: ready-to-merge
