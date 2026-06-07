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

## RESULTS — first real run (2026-06-06)

Model `claude-haiku-4-5` (temp 0), renderer **v1.0.0**, 4 souls (seeds 1–4), default smooth aligned
lifetime (300 sessions, 4 stages), silhouette subsampled to ~8/stage. 165 judge calls — only 26 hit
the model (the rest cache), via the Claude Code subscription backend.

### The three central-bet questions

1. **Does a blind reader recover the personality from voice alone?** **YES.** Across all 40
   aspect-values, **Pearson r(truth, recovered) = 0.905**; mean per-aspect error 0.13–0.19; **0/4
   sticker alarms** (baseline distance 0.24–0.34, far above any sticker threshold). The prose
   encodes the soul and a cold judge reads it back.
   - **Caveat / actionable knob finding — the renderer AMPLIFIES.** The error is systematic, not
     random (that's why r is high *and* error is non-trivial): mild mid-range traits read as
     near-pole. Soul 0 example — `openness 0.37→0.10`, `intellect 0.40→0.10`, `volatility
     0.41→0.10`, `compassion 0.61→0.70`. The intensity ladder (`magnitude=|v−0.5|·2`, 12 rungs)
     over-expresses around 0.5: a 0.4 disposition is rendered like a 0.1. **Lever: soften the
     ladder's low-magnitude rungs / compress its range** so mid dispositions don't read extreme.
2. **Are two uls distinguishable?** **YES** — leak-free pairwise voice separation **mean 0.557, min
   0.394, max 0.730** (all 4 souls well-separated in the 12-axis style space). The formal cross-soul
   diagonal is **1.000 but degenerate** (sample≡reference under the prompt-independent renderer — see
   the leak section above); it is NOT evidence either way.
3. **Is drift perceptible and smooth?** **Perceptible: YES** (net displacement 0.396, ~4× the
   ½-threshold). **Smooth: UNPROVEN** — `maxStep 0.462` trips the jerk test (`continuous=false`), but
   `meanStep` is 0.15 and the life is smooth *by construction* (positive fit, zero breaks), so the
   lone outlier is almost certainly **embed quantization noise** (the LLM rates 12 axes in ~0.1
   steps), not a personality teleport. Continuity can't be certified until a continuous text
   embedding (e.g. Voyage) replaces the LLM-rated feature vector.

Two more results:
- **Stage silhouette = 0.056 (not clustered).** Life-stages do NOT separate in style space — as
  expected: Layer 1 renders from disposition `v` only, and stage/age don't reach the floor yet (the
  spine/framing/drift layers are explicitly out of this brick's scope). Stages will stay
  indistinct until the renderer expresses them.
- **Ablation: 0 flat aspects, sensitivity 4.09–5.52.** Every one of the 10 numbers measurably drives
  the prose (none is "deaf"). `allMonotonic=false` is again embed-noise: a few ±0.05 probes shifted
  slightly more than their ±0.10 sibling — within rating quantization.

### Calibration — recommended thresholds

_From `.live-run.json`. **NOT applied to `metrics.ts` defaults** — those stay fake-judge-scale so the
CI suite stays green (the LLM embed lives at a different scale). These are the live judge's set,
applied via per-metric `opts`._

| threshold | fake default | observed (live) | live-calibrated | note |
|---|---|---|---|---|
| STICKER_EPS | 0.05 | min baseDist 0.238 | **0.12** | ½ weakest real signal — comfortable margin |
| DIAGONAL_THRESHOLD | 0.75 | rate 1.000 (chance 0.25) | — | degenerate (leak); use voice separation |
| PERCEPTIBILITY | 0.1 | net 0.396 | **0.20** | ½ observed net drift |
| JERK | 0.15 | maxStep 0.462 | **0.69** | ⚠ noise floor of the LLM embed, not a real bound |
| SILHOUETTE_THRESHOLD | 0.1 | mean 0.056 | **keep 0.1** | renderer fails by design (no stage expression yet) — don't lower to fake a pass |
| FLAT_EPS | 0.01 | min sens 4.087 | **2.0** | ½ weakest non-flat aspect (embed-scale) |

Per-aspect ablation sensitivity (ascending): openness 4.09 · assertiveness 4.44 · industriousness
4.46 · volatility 4.80 · withdrawal 4.81 · enthusiasm 4.88 · politeness 4.94 · intellect 5.33 ·
compassion 5.44 · orderliness 5.52.

### Renderer expression-knob sweep — scoped out (with reason)

A fine sweep of the ~9 knobs is **gated on fixing the embed**: the LLM-rated feature vector quantizes
in ~0.1 steps, so knob deltas smaller than that floor are indistinguishable from noise (this is the
same noise that makes `JERK`/`allMonotonic` unreliable). Running a sweep now would mostly measure
quantization. The highest-value knob change is already evidenced *without* a sweep — **soften the
intensity ladder** (finding #1's amplification). Recommended order for the next brick:
1. Swap `embed` to a real continuous embedding (Voyage) → unlocks reliable JERK + monotonicity + a
   meaningful knob sweep.
2. Add a prompt-sensitive (model-in-the-loop) sample step → makes cross-soul confusion real.
3. Then sweep the ladder / rulebook / interaction knobs against the now-trustworthy metrics.
