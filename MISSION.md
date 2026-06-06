# Mission: Renderer Layer 2 (Phase 3) — the real-voice few-shot pervade engine

**Started:** 2026-06-06
**Branch:** claude/renderer-layer2
**Parent:** main @ 211ace5

## Goal
Add **Layer 2** to `packages/renderer`: state-matched real-voice few-shot — inject the ul's own
past messages (nearest its current state) as "this is how you sound," so the voice becomes *its
own* as history accrues. Layer 1 (the rulebook floor) already ships and carries day-1; Layer 2 is
the **pervade engine** that takes over as the corpus grows. PURE: imports only `@saulene/core`.

**You are extending a tested package — do NOT regress it.** The 16 Layer-1 renderer tests must
stay green, and `render(soul)` with NO samples must remain byte-identical to today (Layer 2 is
additive: no corpus → pure Layer-1 floor).

## Boundary note (important) — renderer can't import storage
The renderer may import ONLY `@saulene/core`. Voice samples live in `storage`, which the renderer
may NOT import. So **define a local input type** for samples; the plugin (which imports both) maps
storage's persisted `VoiceSample` into it. Pin this shape:
```ts
import type { AspectVector } from "@saulene/core";
/** A captured past message, supplied to the renderer by the plugin (mapped from storage). */
export interface VoiceSampleInput {
  text: string;                 // the ul's own past message (form, NOT content to restate)
  state: AspectVector;          // soul aspect-vector tagged at capture (for state-distance)
  provenance: { model: string; ageSessions: number };  // for down-weighting old-model/stale samples
}
```

## Extend the render signature (backward-compatible)
Today: `render(soul) → RenderedInjection`. Make Layer 2 OPTIONAL via an opts arg so the no-corpus
path is unchanged:
```ts
render(soul, opts?: { voiceSamples?: VoiceSampleInput[]; corpusSize?: number }) → RenderedInjection
```
- `opts` absent / empty samples ⇒ return EXACTLY today's Layer-1 output (existing golden tests pass).
- With samples ⇒ assemble a few-shot voice block and fold it into `RenderedInjection.text` (keep
  `fragments` = the per-aspect Layer-1 fragments so the harness's ablation locality still holds; the
  voice block is added to `text`, not into a per-aspect fragment). Consider adding a `voiceBlock`
  field to `RenderedInjection` for testability (optional/empty when no corpus).

## Layer-2 guardrails (SPEC §"Layer 2", ~432–443) — load-bearing, not polish
- **Anti-quotation + topic-orthogonal framing:** present samples as "these are how you SOUND — not
  things that happened; never restate their content." Without this it content-bleeds and talks
  *about* old topics. The framing line is mandatory.
- **Match the CURRENT state + decay old samples:** order/weight the supplied samples by
  state-distance to the *current* soul (L2 over aspects) and prefer recent — never freeze the voice
  at the moment the corpus got dense. (Storage does the retrieval; here, weight/trim what's passed.)
- **Provenance-weight down old-model samples:** use `provenance` to down-weight stale/old-model
  samples (host-upgrade safety).
- **Cold-start crossfade:** at low corpus, lean on a small set of **synthetic prior exemplars**
  (built-in, neutral, derived from the soul's Layer-1 directives) and crossfade toward real
  captured samples as `corpusSize` grows — so day-1 isn't starved and Layer 1 carries until the
  corpus is dense. Document the crossfade curve (e.g. weight on real samples rises with corpusSize).

## Out of scope
- Layers 3 (spine), 4 (anti-decay re-injection), 5 (drift events) — separate later items.
- The two-shelf DIARY bridge line + actual retrieval from disk — that's storage + the plugin at
  inject time. Here you only assemble the VOICE few-shot block from samples handed in.
- Capturing/persisting samples (storage's job). `core` changes. The `viz-exploration` sprite code.

## Proof (deterministic vitest)
- **No-corpus = Layer 1 unchanged:** `render(soul)` and `render(soul, {})` are byte-identical to the
  current Layer-1 output (golden). All 16 existing tests stay green.
- **Few-shot block assembled:** with samples, `text` contains the voice block + the anti-quotation
  framing line; `fragments` are still the pure per-aspect Layer-1 fragments (ablation locality intact).
- **State-distance ordering:** given samples at varying state-distance, the nearer-to-current ones
  are preferred/weighted higher.
- **Provenance down-weighting:** an old-model/stale sample is weighted below a fresh one.
- **Cold-start crossfade:** empty/small corpus → synthetic exemplars dominate; large `corpusSize` →
  real samples dominate. Assert the crossfade shifts with corpus size.
- **Determinism:** same (soul, opts) → byte-identical injection.

## Done
`pnpm check` green (boundaries + lint + typecheck + ALL renderer tests, old + new), and
`BUILD_GUIDE.md` updated IN THE SAME COMMIT: note Layer 2 done within the "5 renderer layers" item
(Layers 3–5 still pending). Add a `## Verification` block to THIS MISSION.md before marking ready
(`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Layer 2 — State-matched real-voice few-shot" (~432–443) + the
re-skinnable boundary (~483); `docs/ARCHITECTURE.md` (renderer is pure, imports only core).

## Key files
- `packages/renderer/src/layers/voice.ts` — NEW. Layer 2: `VoiceSampleInput`, `VoiceOpts`,
  weighting (`rankVoiceSamples`), `syntheticExemplars`, `realFraction` crossfade, `buildVoiceBlock`.
- `packages/renderer/src/layers/index.ts` — `render(soul, opts?)` extended; `RenderedInjection`
  gains a `voiceBlock` field; re-exports Layer-2 surface.
- `packages/renderer/test/voice.test.ts` — NEW. 16 Layer-2 tests.
- `BUILD_GUIDE.md` — Layer-2 item marked done within the "5 renderer layers" line.

## Verification
- Build: pass (`tsc -b` clean)
- Tests: pass (123 passed: 16 original renderer + 16 new Layer-2 + rest of monorepo)
- Scope kept: yes — additive Layer 2 only; no-corpus path byte-identical (golden snapshot + 16 floor
  tests untouched/green); renderer still imports only `@saulene/core` (boundaries clean); core/storage
  unchanged. Provenance "current model" is inferred as the freshest sample's model (renderer has no
  current-model input; opts shape kept to the pinned `{voiceSamples, corpusSize}`) — documented in voice.ts.
- Summary: `render(soul, opts?)` folds a state/recency/provenance-weighted few-shot voice block (with
  mandatory anti-quotation framing + synthetic→real cold-start crossfade) into `text`; fragments/soulHash
  stay pure Layer-1.

## Status
Status: ready-to-merge
