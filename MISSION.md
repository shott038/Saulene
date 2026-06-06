# Mission: Renderer stub (Phase 3) — `state → text`, the testable Layer-1 floor

**Started:** 2026-06-06
**Branch:** claude/renderer-stub
**Parent:** main @ 4ca1476

## Goal
Build the `packages/renderer` stub: a **pure, versioned** function `render(soul) → injection`
that turns soul state into the SessionStart injection text. Scope is **Layer 1 only** (the
behavioral-directive rulebook floor that works day-1 from the 10 numbers) plus the three
properties the verification harness requires (per-aspect fragments, no literal trait names,
deterministic soul-hash). Layers 2–5 (few-shot retrieval, spine, framing, drift) need the memory
store + LLM and are LATER — do NOT build them. PURE: renderer imports only `@saulene/core`; no IO,
no LLM, no clock/entropy. Same soul → same injection (golden-file testable).

## Shared renderer↔harness contract (PINNED — the harness worker codes against this EXACT shape)
Implement and export this surface. Do not deviate from the names/shape — a parallel harness worker
is building against it.
```ts
import type { Soul, Aspect } from "@saulene/core";

/** The SessionStart injection, decomposed for testability. */
export interface RenderedInjection {
  /** Assembled first-person injection. NO "## Personality" header, NO literal trait names. */
  text: string;
  /** One fragment per aspect, so the harness can ablate a single trait. Assembled into `text`. */
  fragments: Record<Aspect, string>;
  /** Deterministic hash of the soul state — stamped per transcript for exact replay. */
  soulHash: string;
}

/** Pure + versioned: same soul → same injection. */
export type RenderFn = (soul: Soul) => RenderedInjection;
export const RENDERER_VERSION: string;        // bump when the rulebook changes (golden-file guard)
export function render(soul: Soul): RenderedInjection;   // concrete RenderFn
```

## Layer 1 — the behavioral-directive rulebook (SPEC §"The layered renderer", lines ~420–430)
A **versioned data file** maps each of the 10 aspects to *concrete imperative behaviors*, **never
adjectives**. (SPEC's example: `Compassion-high → "open bad news with one clause naming how it
lands before the fix."`) Honor every guardrail — they are load-bearing, not polish:
- **Continuous rendering, NOT coarse bands.** The float must modulate the fragment continuously —
  71 and 60 must NOT produce identical output (else drift goes invisible). Render intensity from
  the value, e.g. pick/scale directives by where `v` sits, with smooth thresholds, not 3 buckets.
- **Pair each directive with one micro-demonstration** (rules+example beats rules-alone).
- **No literal trait names** in `text` or `fragments` — distinctness comes from *behavior/style*,
  never self-report ("you are agreeable" is banned; describe what it DOES).
- **No frequency-budget directives** ("1 intensifier per 2 turns") — an LLM can't count across turns.
- **Trait interactions:** implement the *mechanism* for resolving high-traffic interactions (e.g.
  low-Orderliness + high-Industriousness) and encode a FEW; flag the full ~8–12 resolutions
  `// TUNABLE (Phase 3)` — do NOT rabbit-hole writing all of them now.

## Framing (SPEC Layer 4, the cheap part that belongs in the floor)
- First-person. **No `## Personality` header** (a labeled block reads as metadata the model
  reverts from). Assemble the per-aspect fragments into coherent first-person guidance.
- Drop theatrical interior-monologue. Framing yes, drama no.

## soulHash + version
- `soulHash(soul)` — deterministic, pure (hash the rendered-relevant state). Used by the harness for
  exact-replay stamping. `RENDERER_VERSION` bumps when rulebook output changes (golden-file guard).

## Out of scope
- Layers 2–5 (few-shot/retrieval, spine config, anti-decay re-injection, drift events), the
  stylometric fingerprint impl, the voice charter, the sprite/look surface — all later.
- Any `core` change. Perception/storage/plugin. The `viz-exploration` worktree's sprite code.
- Writing all 8–12 interaction resolutions (mechanism + a few; rest flagged tunable).
- Tuning the rulebook to "feel right" — that's the interactive tuning pass after the harness lands.

## Proof (deterministic vitest)
- **Determinism / golden file:** same soul → byte-identical injection; a small golden snapshot.
- **No literal trait names:** assert none of the aspect names (or obvious synonyms list) appear in
  `text`/`fragments`. (This is a hard guardrail the harness depends on.)
- **Continuous, not banded:** two souls differing by a small Δ on ONE aspect (e.g. 0.60 vs 0.71)
  produce DIFFERENT fragments for that aspect (drift stays visible).
- **Ablation locality + monotonicity:** perturbing one aspect changes mainly that aspect's fragment,
  and increasing the value shifts its directive intensity monotonically (the harness's ablation
  metric relies on this).
- **soulHash:** deterministic, and changes when rendered-relevant state changes.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE
SAME COMMIT: check off the `renderer` stub item in Phase 3. Add a `## Verification` block to THIS
MISSION.md before marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"The layered renderer" (Layer 1 + the re-skinnable boundary, ~406–485)
+ §"Verifying expression — the harness" for the three renderer requirements (~507–510);
`docs/ARCHITECTURE.md` (renderer is pure, imports only core).

## Verification
- Build: pass (`pnpm typecheck` / `tsc -b` clean)
- Tests: pass (73 passed — 16 new renderer tests; golden snapshot, no-trait-names, continuous-not-banded, ablation locality + monotonicity, soulHash)
- Scope kept: yes — Layer 1 only; Layers 2–5 + fingerprint left as stubs; no `core` change; 3 trait-interactions encoded, rest flagged `TUNABLE (Phase 3)`
- Summary: pure versioned `render(soul) → {text, fragments, soulHash}` in `packages/renderer/src/layers/` — a continuous behavioral-directive rulebook (12-rung intensity ladder, per-aspect fragments, headerless first-person assembly, FNV-1a soulHash). `pnpm check` green.

## Key files
- `packages/renderer/src/layers/rulebook.ts` — versioned DATA: `RULEBOOK` (10 aspects × low/high directives+demos), `INTENSITY_LADDER`, `INTERACTIONS`, `RENDERER_VERSION`.
- `packages/renderer/src/layers/index.ts` — `render`, `renderFragment`, `intensityTier`, `soulHash`, `RenderedInjection`/`RenderFn` types + the pinned contract surface.
- `packages/renderer/test/renderer.test.ts` (+ `__snapshots__/`) — the proof suite.

## Status
Status: ready-to-merge
