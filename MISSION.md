# Mission: real LLM Judge + first harness run (validate the central bet)

**Started:** 2026-06-06
**Branch:** claude/real-judge-tuning
**Parent:** main @ 6b79ee7

## Goal
Turn the verification harness from "tested apparatus, never measured" into a real number. The
harness (`tools/harness`) already defines the `Judge` port (`recoverTraits` / `guessAuthor` /
`embed`) and the 5 metrics (trait-recovery/anti-sticker, cross-soul confusion, longitudinal
trajectory, stage silhouette, per-aspect ablation), all green against a deterministic `fakeJudge`.
This brick:
1. **Build a real LLM-backed `Judge`** — implement the three port methods against a real model
   (an `LlmClient`-style port; the existing `AnthropicLlmClient` in `packages/plugin/src/hooks/llm.ts`
   is the reference impl — haiku, temp=0). `recoverTraits` = "read this voice, rate these 10
   behavioral dimensions 0–1" (behaviorally anchored, NO trait names leaked into the prompt);
   `guessAuthor` = attribution; `embed` = embeddings call.
2. **Wire it to the REAL renderer** — point the harness at `@saulene/renderer`'s actual `render`
   (not a fake `RenderFn`) + the real judge, over replayed synthetic lifetimes from the simulator.
3. **Run the loop & calibrate** — do the first real harness run, then calibrate the `// TUNABLE
   (Phase 3)` thresholds (`STICKER_EPS`, `DIAGONAL_THRESHOLD`, `PERCEPTIBILITY`, `JERK`,
   `SILHOUETTE_THRESHOLD`, `FLAT_EPS`) and sweep the ~9 renderer expression knobs + per-stage table
   against the metrics. Record findings (does a blind reader recover the personality from the voice
   alone? are two uls distinguishable? is drift perceptible + smooth?).

## Key files (actual)
- `tools/harness/src/judge.ts` — added `realJudge` (recoverTraits / guessAuthor / embed) + the
  behaviorally-anchored `JUDGE_DIMENSIONS` and `EMBED_AXES`
- `tools/harness/src/llm.ts` — `AnthropicJudgeClient` (SDK/billed) + `ClaudeCliClient` (subscription,
  shells out to `claude -p`, no API key); `cache.ts` — shared disk memo
- `tools/harness/src/live.ts` — wires real `@saulene/renderer` render + `realJudge`, parallel
  cache-warm, dumps `.live-run.json`; `live-artifact.ts` — the artifact shape (no side effects)
- `tools/harness/src/calibrate.ts` — offline threshold recommendation from the dumped run
- `tools/harness/src/metrics.ts` — `stageSilhouette` gained an optional `maxPerStage` subsample;
  TUNABLE comments now cite the live-calibrated set (defaults kept at fake-scale for CI)
- `tools/harness/src/index.ts` — `runHarness` gained `maxSilhouettePerStage`; new exports
- `tools/harness/FINDINGS.md` — **the first real metric numbers + interpretation**
- Reference used: `packages/plugin/src/hooks/llm.ts` (`AnthropicLlmClient`), `tools/simulator`

## Boundary / cost notes
- `core` / `renderer` stay PURE — never add IO/LLM to them. The judge's IO lives in dev-only
  `tools/harness`. Run `pnpm check:boundaries` — if the real judge needs the Anthropic client,
  decide its home so the boundary guard stays green (don't make harness import `plugin` if that
  breaks the ALLOWED graph; lift/share the client cleanly or give the harness its own).
- Real model calls cost money and are non-deterministic: keep the LLM judge OUT of the default
  `pnpm test` path (the `fakeJudge` tests must stay the CI default). Gate the real run behind an
  explicit script / env (e.g. needs `ANTHROPIC_API_KEY`) so CI never makes live calls.
- Record the first real-run metric numbers in a committed findings doc (e.g. `tools/harness/FINDINGS.md`
  or a NOTES section) — this run is the project's central-bet evidence; don't let it evaporate.

## Out of scope
- `plugin/mcp`, `/ul` skill, setup wizard, plugin manifest — separate bricks
- Text renderer Layers 3–5 (spine/framing/drift) + fingerprint — separate item (tune what exists first)

## Status
Status: ready-to-merge

## Verification
- Build: pass (`pnpm build` / `tsc -b` clean)
- Tests: pass (267 passed — `fakeJudge` suite unchanged; the live judge has no `.test.ts`, never runs in CI)
- Boundaries: pass (`pnpm check:boundaries` clean — harness got its own `@anthropic-ai/sdk`, never imports `plugin`)
- Lint: changed files clean (`biome check` on the new/edited harness files). Pre-existing repo-wide
  lint debt in untouched packages is unchanged — not introduced here.
- Live run: DONE — real Haiku judge over the real renderer, via the Claude Code subscription
  (`ClaudeCliClient`), 26 model calls. Numbers committed in `tools/harness/FINDINGS.md`.
- Scope kept: yes, with two documented in-scope adjustments (see Final notes).

## Final notes (for the merger / next brick)
- **Central-bet result:** blind trait recovery works — Pearson r(truth,recovered)=0.905, 0/4 sticker
  alarms; voices are distinct (leak-free separation mean 0.557); drift is perceptible. See FINDINGS.
- **Thresholds were calibrated but NOT written into `metrics.ts` defaults.** The LLM judge's embed
  lives at a different scale than the `fakeJudge`; overwriting the defaults would break the CI suite.
  The live-calibrated set is recorded in FINDINGS and applied via per-metric `opts`. This is the
  correct reconciliation of "calibrate the thresholds" + "fakeJudge tests stay the CI default".
- **Two structural gaps surfaced (documented, not fixed — they're separate bricks):** (1) cross-soul
  confusion is degenerate under a prompt-independent renderer (sample≡reference → trivial diagonal);
  a leak-free voice-separation signal stands in. (2) `embed` is an LLM-rated feature vector (Anthropic
  has no embeddings API) and quantizes ~0.1, which makes the JERK/continuity + monotonicity checks
  noisy. **The renderer knob-sweep is gated on swapping in a real continuous embedding (Voyage)** — a
  fine sweep now would mostly measure quantization. The one evidenced knob change: soften the
  intensity ladder (the renderer amplifies mild mid-range traits toward the poles).
- Run artifacts (`.live-run.json`, `.judge-cache.json`, `.live-run.log`) are gitignored.
