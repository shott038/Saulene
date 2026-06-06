# Mission: Perception (Phase 4) — session transcript → evidence-cited ledger

**Started:** 2026-06-06
**Branch:** claude/perception
**Parent:** main @ 211ace5

## Goal
Build `packages/perception`: turn a session transcript into a **bounded, quote-validated,
first-person ledger** the engine can consume. The LLM is the senses; the engine is the body —
perception NEVER decides how much personality changes, it only emits a sparse evidence-cited
judgment; `@saulene/core` turns that into numeric change. The LLM is a **dependency-injected
`LlmClient` port** (already stubbed in `src/index.ts`), so perception stays testable with a
scripted fake — no real SDK here (that's the plugin edge).

Boundary: imports only `@saulene/core`. `zod` is already a project dependency (storage added it).

## Build on the existing stubs (read them first)
`src/index.ts` (LlmClient port + re-exports), `src/schema.ts`, `src/validate.ts`,
`src/rubric/index.ts` — all stubbed with the design in their headers. Implement those TODOs.

## 1. Schema (`src/schema.ts`) — zod is the SOURCE OF TRUTH
Define as zod schemas (types via `z.infer`), per SPEC §"Diary + Evidence-Cited Sparse Ledger"
(~611–648):
- **`Observation`** (one per genuinely-exercised aspect — SPARSE, never force-fill all 10):
  - `aspect` — enum of the 10 (import `ASPECTS` from core; build the enum from it)
  - `mode` — `task` | `interaction`
  - `practice` — bounded ordinal 0–3 (how much exercised)
  - `fit` — bounded signed ordinal −3..+3 (how it landed — ORTHOGONAL to practice; "did a lot but hated it" must round-trip)
  - `confidence` — `low` | `med` | `high`
  - `evidence_quote` — string (HARD-validated downstream against the transcript)
  - `first_person_note` — short "I…" gloss
  - `salience` — 0–3 (how formative)
  - optional enrichment: `goal_congruence`, `agency`, `surprise_vs_self` (salience tags only)
- **`SessionJudgment`** = `{ observations: Observation[], session_significance: number (bounded
  [0,1]), schema_version: string, diary: string }`. Diary = Layer B, a short first-person entry
  the engine IGNORES (legibility + fine-tune corpus).
- **Derive the LLM's JSON Schema from the same zod definitions** (so the prompt's structured-output
  contract and the validator never drift). A helper that emits the JSON schema is fine.

## 2. Validate (`src/validate.ts`) — the anti-hallucination + no-mirror gate
`validateLedger(judgment, transcript) → { valid, rejected[], cleaned }`:
- **Quote presence (anti-hallucination):** every `evidence_quote` must be a **verbatim substring
  literally present in the transcript** — reject any observation whose quote isn't found. This is
  the load-bearing gate; be strict (exact substring, not fuzzy).
- **First-person lock (no-mirror):** the user may appear ONLY inside `evidence_quote`.
  `first_person_note` must be "I…" grammar; reject anything that profiles the user (second-person
  "you…", or assertions about the user's traits). Structural enforcement of the no-mirror guarantee.
- Return what was rejected and why (so the plugin can log/regenerate), and the cleaned judgment
  (only valid observations).

## 3. Rubric (`src/rubric/index.ts`)
- `RUBRIC` — behaviorally-anchored guidance text handed to the LLM: first-person experiences →
  which of the 10 aspects they tend to exercise (the old signal taxonomy, now GUIDANCE not a
  hardcoded lookup). Anchored ordinals for practice/fit so a cheap model doesn't collapse to
  midpoints. `SCHEMA_VERSION` constant (stamped into judgments for re-scoring across model swaps).

## 4. The pipeline (`src/index.ts` or a new `perceive.ts`)
`perceive(transcript, llm, opts?) → Promise<SessionJudgment>`:
- Build the prompt (RUBRIC + the derived JSON schema + the transcript), call `llm.complete`, parse
  + zod-validate the output, run `validateLedger`, return the cleaned judgment.
- **Extract-first, diary-second** (SPEC guardrail): the ledger is extracted BEFORE the diary so a
  tidy narrative can't cherry-pick quotes to fit. Either two calls (ledger, then diary) or one
  call with enforced ordering — document the choice. Cheap-model framing: low temperature, single
  pass per session is the intended production shape.
- On invalid LLM output: fail informatively (the plugin decides retry policy) — do NOT silently
  pass malformed/hallucinated rows to the engine.

## Out of scope
- The real LLM SDK/client (plugin edge). The harness's `Judge`-over-LLM impl (separate, later —
  note: wiring a real Judge for expression tuning is a FOLLOW-UP, not this mission).
- `core` changes. Storage bridging (the plugin maps perception output → storage records). The
  rubric's full anchor wording can be a solid first pass, flagged for tuning. The `viz-exploration` code.

## Proof (deterministic vitest with a scripted fake `LlmClient`)
- **Schema round-trips:** a valid judgment parses; an out-of-range ordinal (practice 5, fit 9) is
  rejected by zod.
- **Quote gate:** an observation whose `evidence_quote` is NOT in the transcript is rejected; one
  whose quote IS present passes. (Both paths.)
- **First-person lock:** a `first_person_note` that profiles the user ("you are…") is rejected; an
  "I…" note passes.
- **Sparse, not force-filled:** a transcript exercising 2 aspects yields ≤ a handful of
  observations, not 10.
- **perceive() end-to-end:** a fake LlmClient returning canned JSON → a validated `SessionJudgment`;
  a fake returning a bad quote → that row stripped.
- **Determinism:** same transcript + same fake → same judgment.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE
SAME COMMIT: check off the `perception` Phase-4 item. Add a `## Verification` block to THIS
MISSION.md before marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Diary + Evidence-Cited Sparse Ledger" (~611–648) + §perception
decided (~853); the stub headers; `docs/ARCHITECTURE.md` (perception imports only core; LLM is an
injected port).

## Verification
- **Build: pass** — `pnpm check` green (boundaries clean · biome lint clean · `tsc -b` clean ·
  124 tests pass, 17 of them in `packages/perception`).
- **Tests: pass** — deterministic vitest with a scripted fake `LlmClient`: schema round-trips
  (valid parses; practice 5 / fit 9 rejected by zod) · quote gate both paths (verbatim present
  passes, paraphrase/absent rejected) · first-person lock (second- and third-person user
  references rejected, "I…" passes) · sparse (2-aspect session → 2 observations, not 10) ·
  `perceive()` end-to-end (canned JSON → validated judgment; bad-quote row stripped) ·
  schema_version stamped authoritatively · `PerceptionError` on non-JSON / schema-fail ·
  determinism (same transcript + same fake → identical judgment).
- **Scope kept: yes** — only `packages/perception` (+ its `package.json` zod dep, already in the
  lockfile from storage) and the BUILD_GUIDE Phase-4 checkbox. No `core` changes, no real SDK, no
  storage bridging, no Judge wiring (all noted as follow-ups / plugin edge).

## Status
Status: ready-to-merge
