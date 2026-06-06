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

## Key files (expected)
- `tools/harness/src/judge.ts` — currently the port + `fakeJudge`; add the real LLM judge
- `tools/harness/src/render.ts` / `index.ts` — wire the real `render` in for the live run
- `tools/harness/src/metrics.ts` — calibrate the TUNABLE thresholds from real-run data
- `packages/renderer/src/layers/` — the ~9 expression knobs (rulebook/intensity ladder/voice block)
- Reference: `packages/plugin/src/hooks/llm.ts` (`AnthropicLlmClient`), `tools/simulator` (lifetimes)
- Read first: `SPEC.md` (Expression layers + the harness section), `docs/ARCHITECTURE.md`, Phase 3 in
  `BUILD_GUIDE.md`

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
Status: in-progress
