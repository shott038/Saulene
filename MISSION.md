# Mission: renderer age/stage expression — make drift noticeable over time (13–65)

**Started:** 2026-06-07
**Branch:** claude/renderer-age-expression
**Parent:** main @ ef0a1f9

## Why
The live golden run proved the soul *changes* (frozen-soul control passes) but the change is
**not legible in the voice over time** — the `crossTimeIdentity` metric FAILs `orderable=false`:
a judge reads the early and late transcripts as the same being but can't tell which is older.
Cause: the renderer expresses the 10 trait numbers but NOT stage/age. This mission adds age/stage
voice expression so an older ul *sounds* more seasoned — turning "real in the numbers" into
"noticeable to the user."

## Design principle (load-bearing — do NOT violate)
**Age changes MANNER, never CAPABILITY.** Competence never degrades (SPEC: disposition-only;
competence = the LLM). An older ul is more economical, settled, dry, draws on experience — NOT
slower, confused, smaller-vocabulary, or "stupid". A younger ul is eager and exploratory — NOT
infantile. Range presents as a believable **13 → 65 years old**: no baby, no dying/frail elder.

## The age model — 13→65 on the EXISTING 4 engine stages (do NOT change engine dynamics)
Do **not** touch the engine stages or their plasticity/set-point dynamics (childhood's high
plasticity + adolescence's set-point repulsion are load-bearing for divergence). Add a *presented
age* on top. Internal stage names stay (renaming `core` ripples everywhere); only presented age +
voice change.

| Engine stage (internal, unchanged) | Presents as | Voice texture |
|---|---|---|
| childhood | 13–17 | bright, curious, absorbing, fast-forming — a sharp teen, not a toddler |
| adolescence | 17–24 | moody/contrarian/trying-on-selves (already specced) — real teen→young-adult |
| early_adulthood | 25–40 | settling, driven, decisive, identity crystallizing |
| old_adulthood | 42–65 | measured, economical, dry, seasoned — a sharp 60, NOT declining |

## Bricks (build + verify each before the next — never oneshot)

**Brick 1 — `presentedAge(soul) → number ∈ [13,65]`** (pure, in `packages/core`, sibling to
`stageFromMp`/`projectMbti`). Smooth, monotonic MP→age curve so drift is *continuous* (a 30 vs 35
differ slightly — same continuous-not-banded rule Layer 1 follows). Maps the 4 stages onto the
sub-ranges above. Deterministic, unit-tested (monotonicity, bounds [13,65], stage→subrange).

**Brick 2 — Age/stage voice layer in `packages/renderer`** (the missing stage-expression layer).
A versioned data table mapping presented-age → concrete *texture* directives + one micro-demo each,
in Layer 1's imperative-not-adjective style. Modulates MANNER axes only: cadence/word-economy,
hedging↔decisiveness, exploration↔settledness, enthusiasm↔dryness, reference-frame ("let's try" →
"in my experience"). Folds into `render().text`; stays PURE; golden-file tested; fragments stay
ablation-decomposable. Additive: a soul with no age signal must still produce the existing Layer-1
output (don't break the 16+ existing golden tests).

**Brick 3 — Guardrails (tested):**
- **Competence-invariance contract** — ablate age 13→65; assert *manner* shifts but a judge rates
  *clarity/capability* flat. Mirror the existing `SPRITE_EXCLUSIVE` ablation-contract style.
- **No theatrical tropes** — reuse the SPEC's KILLED list: no "back in my day", no `*adjusts
  glasses*`, no self-labeling ("now that I'm older…"). Age shows through judgment + cadence, not costume.
- **Bounded extremes** — clamp so 13 never reads childish-incompetent and 65 never reads frail.

**Brick 4 — Wire to the cross-time metric + tune.** Re-run `crossTimeIdentity`
(tools/life-sim/src/validation). Success = `orderable` flips **true** while `sameBeing` stays
**true** and competence stays flat. Tune age-expression magnitude against that — strong enough to
notice, gentle enough to stay one being. (Live tuning runs: keep to 1 seed / haiku — small.)

## Out of scope
- Engine stage dynamics, plasticity, MP bands, set-point math — untouched.
- Renderer Layers 2 (voice few-shot) internals, sprite — untouched except where age folds in.
- No `core` stage renames.

## Constraints
- `core` + `renderer` stay PURE (zero IO/LLM/clock). `pnpm check` MUST stay green.
- Additive to Layer 1: existing golden tests keep passing.

## Key files (expected)
- `packages/core/src/stages/` (add `presentedAge`) + its index export + tests
- `packages/renderer/src/` (age voice layer + data table) + golden tests
- `tools/life-sim/` (only if the cross-time tuning needs a knob exposed)

## Verification
- `pnpm check` green (boundaries + lint + typecheck + tests).
- New tests: presentedAge bounds/monotonicity; age-voice golden + ablation; competence-invariance.
- `crossTimeIdentity` design note: how `orderable` is expected to flip (a live 1-seed run is
  optional given limit — document the expected effect if you don't run it).
- Update `BUILD_GUIDE.md` in the SAME commit (renderer Layers 3–5 / age expression progress).

## Verification
- Build: pass
- Tests: pass (490 passed across 25 test files, 0 failed)
- Scope kept: yes — engine dynamics, Layer 2 internals, and stage renames untouched; all additive
- Summary: `presentedAge()` in core + age voice layer in renderer (3 manner axes, 12-rung ladders, mp=0 additive); competence-invariance + theatrical-tropes guardrails tested; pnpm check green

## crossTimeIdentity design note (Brick 4)
A live 1-seed LLM run was not performed (cost constraint). Expected effect: `orderable` flips
**true** because the age voice block now changes meaningfully between childhood (age ~13–17:
"thinking out loud, revising readily, fresh-eyes framing") and old_adulthood (age ~42–65:
"sparing with words, speaks from conviction, pattern-recognition framing") — a judge reading
transcripts from those two stages should now be able to place them in order. `sameBeing`
should stay **true** because the Layer-1 personality fragments (the 10 aspect numbers) are
unchanged — same soul, different seasoning. Competence stays flat by construction: the
competence-invariance contract is enforced in the ladder data and tested at every rung.
Tuning lever: `CADENCE_LADDER` / `DECISIVENESS_LADDER` / `FRAME_LADDER` magnitude — if
`orderable` flips but `sameBeing` breaks, tone down the contrast between rung 0 and rung 11.

## Status
Status: ready-to-merge
