# Harness FINDINGS — the central-bet measurement

The verification harness was *tested apparatus, never measured*: five metrics, all green against a
deterministic `fakeJudge`, but never once run against a real model reading real renderer prose. This
doc records the first **real** run — the project's central-bet evidence: _does a blind reader recover
the personality from the voice alone? are two uls distinguishable? is drift perceptible and smooth?_

## What was built (this brick)

- **`realJudge(llm)`** (`src/judge.ts`) — the three `Judge` port methods against a real model:
  - `recoverTraits` — rate 10 behaviorally-anchored dimensions ∈ [0,1] from prose alone. The
    anchors (`JUDGE_DIMENSIONS`) are *independently worded* paraphrases of the same constructs the
    renderer expresses — deliberately **not** copied from the renderer's `RULEBOOK`, so the judge
    reads style, not a cheat sheet. No literal trait names reach the prompt.
  - `guessAuthor` — an LLM voice line-up over reference samples (cross-soul attribution).
  - `embed` — an LLM-rated **style feature vector** (`EMBED_AXES`, 12 axes). _Anthropic exposes no
    embeddings endpoint_, so this is a single-key proxy for a true text embedding. The metrics only
    need "text → stable vector whose distance tracks voice change"; swap in Voyage/OpenAI embeddings
    later without touching them. **Limitation:** axis ratings are quantized (the model emits ~0.1
    steps), so step-to-step jerk reads lumpier than continuous embeddings would.
- **`AnthropicJudgeClient`** (`src/llm.ts`) — harness-owned SDK wrapper (the boundary graph forbids
  `harness → plugin`, so it can't reuse the plugin's client). Temp 0. Memoises every `complete` to
  `.judge-cache.json` (gitignored), so calibration re-runs and resumed runs cost **zero** calls.
- **`live.ts`** — wires the **real** `@saulene/renderer` `render` + `realJudge` over replayed
  synthetic lifetimes, runs all five metrics, and dumps every raw number to `.live-run.json`.
- **`calibrate.ts`** — offline (zero-call) recommendation of the six `// TUNABLE (Phase 3)`
  thresholds from the dumped run.

### Boundaries / cost / purity (mission constraints — all held)

- `core` and `renderer` stay **pure** — the judge's only IO lives in dev-only `tools/harness`.
- `pnpm check:boundaries` stays green: the harness got its **own** SDK dependency rather than
  importing `plugin`.
- The live judge is **out of the default `pnpm test` path** — `live.ts`/`calibrate.ts` are scripts
  with no `.test.ts`, and `live` is gated behind `ANTHROPIC_API_KEY` (prints how-to and exits 0 when
  absent). CI never makes a live call; the `fakeJudge` suite (267 tests) remains the default.

## How to run

```bash
# one paid pass (Haiku, ~temp 0) — caches to .judge-cache.json so re-runs are free
ANTHROPIC_API_KEY=… pnpm --filter @saulene/harness run live
# offline: turn the raw run into recommended thresholds (no model calls)
pnpm --filter @saulene/harness run calibrate
```

## A known structural gap surfaced by wiring it up — cross-soul confusion is degenerate today

The current `RenderFn` is **prompt-independent**: a soul renders to exactly ONE injection. So in the
cross-soul matrix the "sample" to attribute *is byte-identical* to that soul's own reference, and any
real judge scores a trivially perfect diagonal — it's matching identical strings, not telling voices
apart. (`battery.ts` already flags this: the matrix "lights up the day a prompt-sensitive
model-in-the-loop pipeline replaces the pure RenderFn.") The four other metrics are unaffected —
`recoverTraits` reads the injection directly; trajectory/silhouette/ablation measure embedding
*shifts*.

**Honest stand-in until a generation step exists:** `live.ts` also reports a **leak-free voice
separation** — the mean/min/max pairwise embedding distance between the souls' injections. Large
pairwise distance = genuinely distinct voices. Treat `DIAGONAL_THRESHOLD` as **not yet load-bearing**
and read voice separation instead.

## RESULTS — first real run

> **PENDING — needs one paid `live` pass (no `ANTHROPIC_API_KEY` in the build shell).**
> Run the two commands above, then paste the `calibrate` output below verbatim. Until then the six
> thresholds keep their `// TUNABLE (Phase 3)` placeholder defaults in `metrics.ts`.

<!-- paste `pnpm --filter @saulene/harness run calibrate` output here -->

### Threshold changes applied

_After the run, update `metrics.ts` with the recommended values and note the before→after here._

### Renderer expression-knob sweep

_The ~9 knobs (intensity-ladder length, per-aspect rulebook poles, interaction toggles, voice-block
size/crossfade) sweep against the same metrics. Deferred to the same paid session as the live run —
each knob setting is a re-render + re-judge; with the cache warm, only changed renderings re-cost.
Record per-knob deltas to trait-recovery error, voice separation, and ablation sensitivity here._
