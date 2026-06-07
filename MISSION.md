# Mission: LLM Judge → A/B behavioral validation (the proof-of-life)

**Started:** 2026-06-06
**Branch:** claude/real-judge-tuning
**Parent:** main @ 6b79ee7 (catch up to latest main before Phase 2 — see below)

---

## Phase 1 — real LLM Judge + first harness run ✅ DONE
Built `realJudge` (recoverTraits / guessAuthor / embed), both transports (`AnthropicJudgeClient`
SDK + `ClaudeCliClient` subscription), disk caching, `live.ts` + `calibrate.ts`, and the first
real run. **Result: the central bet holds** — blind trait recovery r=0.905, 0/4 sticker alarms,
voices distinct (separation 0.557), drift perceptible. Numbers + caveats in
`tools/harness/FINDINGS.md`. Key knob finding: the intensity ladder AMPLIFIES mid-range traits.
Held unmerged on purpose; Phase 2 continues on this same branch.

---

## Phase 2 — A/B behavioral validation ✅ DONE — NULL result
Built the two-arm A/B rig (subscription-only). **Result: aggregate lift = 0.000 ± 0.007** — the
injection (`--append-system-prompt`) did NOT move judged behavior toward the target; souled
responses indistinguishable from stock. Legible-but-inert (cf. Phase 1 r=0.905 on the text).
Leading confound: the ~1–2k voice is dwarfed by Claude Code's ~20k system prompt. Numbers +
empirical base persona `r_B` in `tools/harness/AB-FINDINGS.md`. Phase 3 chases the salience confound.

(historical build spec for Phase 2 below)

## Phase 2 build spec (historical)
Turn the prompt-independent "judge reads the injection text" run into a real **A/B behavioral
experiment**: does installing the ul plugin causally shift Claude's *behavior* toward the target
personality, vs the same model with no plugin? Full design: `docs/ab-validation-plan.md` (on main —
`git merge main` first to pull it in). Read that + `tools/harness/FINDINGS.md` before coding.

Build in `tools/harness` (dev-only; never in CI — `fakeJudge` suite stays the default test path;
`core`/`renderer` stay pure; all IO in the harness):

1. **Two-arm response collector** via the existing `ClaudeCliClient` (subscription `claude -p`, NO
   API key — strip `ANTHROPIC_API_KEY` from the subprocess env):
   - **Arm A (treatment):** `claude -p "<battery prompt>" --append-system-prompt "<render(soul).text>"`
     — the faithful SessionStart-hook analog.
   - **Arm B (control):** identical call, NO `--append-system-prompt`. Soul-independent → run ONCE,
     reuse across all souls.
   - Disable tools, `--output-format json`, parse the response text. Cache to disk (like the judge
     cache) so re-runs cost zero.
2. **Judge the RESPONSES, not the injection** — `realJudge.recoverTraits` over each arm's responses
   → a recovered 10-aspect vector per arm. `r_A(soul)` = treatment; `r_B` = empirical base-Claude
   persona (one reused vector — **replaces the assumed 0.5 BASELINE**).
3. **Lift metric** = `dist(r_B, target) − dist(r_A, target)`, aggregate + per-aspect. Positive =
   injection moved behavior toward the target vs baseline. A lift ≈ 0 must be **clearly visible**
   (the falsifiable result — do not hide it).
4. **Distinguishability** — blind `guessAuthor` 2-arm (can the judge pick the souled response set?)
   + add a **"no-plugin" candidate** to the line-up.
5. **Battery** — expand `PROMPT_BATTERY` with neutral **task** prompts (write code, debug, explain),
   not just self-report — the honest test is whether personality leaks into ordinary work. Fixed +
   versioned; blind the judge to arm/soul; randomize order.
6. **Souls** — 4–8 distinct + young/adult/old stage snapshots from the simulator.
7. **Subscription-only:** the **lift metric (recoverTraits) is the load-bearing result**. Leave the
   embed-based metrics (jerk/silhouette) as-is; note they stay noisy (no Voyage). Sample k
   completions/prompt for variance; report a CI.

## Outputs (commit — this is the evidence)
`tools/harness/AB-FINDINGS.md` (or extend `FINDINGS.md`): empirical base persona `r_B`, per-soul +
aggregate **lift with CI**, distinguishability rate, per-aspect breakdown, and a **plain-language
verdict on whether the plugin demonstrably changes Claude's behavior**. Run artifacts gitignored.

## Out of scope
- Voyage/continuous embeddings (paid — defer; keep it subscription-free)
- A full plugin-install end-to-end run (later integration smoke test, not this measurement)
- `plugin/mcp`, `/ul` skill, setup wizard, plugin manifest — separate bricks (mcp/skill already
  landed on main)
- Text renderer Layers 3–5 + fingerprint — separate item

## Boundaries / cost
- `core`/`renderer` PURE; harness owns its IO. `pnpm check:boundaries` stays green (harness never
  imports `plugin`).
- Subscription-only, no metered API. Cache everything. fakeJudge stays the CI default.

---

## Phase 3 — the SALIENCE experiment ✅ DONE — subscription-only, stays free
Phase 2's null is most likely a **delivery** problem, not a content problem: the ul voice is
appended onto Claude Code's ~20k-token system prompt and washed out. Phase 3 finds out by sweeping
**injection salience** while holding everything else constant (same souls, same battery, same k,
same control `r_B`, same lift + distinguishability metrics, same `ClaudeCliClient` subscription
transport). Reuse the Phase-2 A/B rig; just parameterize *how* the voice is delivered.

**Salience sweep — measure lift at each rung (S0 is the Phase-2 null, already have it):**
- **S0 — append-to-system** (baseline): `--append-system-prompt "<voice>"`. The shipping mechanism. lift≈0.
- **S1 — conversation channel**: prepend the voice into the user turn itself — `claude -p
  "<voice>\n\n<prompt>"` (recent-token, high-salience position) instead of / in addition to system.
- **S2 — channel + reinforcement**: S1 plus a short, forceful embodiment directive and/or a repeat
  of the key behavioral lines (raise emphasis WITHOUT rewriting the renderer's content — this is a
  delivery knob, not a renderer change).
- **S3 — CEILING (diagnostic, not shippable)**: `--system-prompt "<voice>"` (FULL replace, no 20k
  competition). This is the disambiguator: if even the ceiling is ~0, the content is inert
  (foundational problem); if the ceiling moves but S0 doesn't, it's pure dilution (delivery problem)
  → then find the minimal shippable rung (S1/S2) that clears zero.

**The decision the sweep produces:**
- Lift rises with salience and the ceiling is clearly > 0 → concept ALIVE, it's a delivery-tuning
  problem; report which rung first clears its CI and is still shippable.
- Ceiling ≈ 0 too → the injected voice does not drive behavior even undiluted; a deep signal about
  the approach — report it plainly, do NOT paper over.

**Hold constant for comparability:** arms = sonnet, judge = haiku, souls 1–4 (+ soul1 stages),
6-prompt battery (2 self-report + 4 task), k=3, blind judge, randomized order, cache everything,
strip `ANTHROPIC_API_KEY`. Also fold the free win in: replace harness `BASELINE = 0.5` with the
measured `r_B`.

## Outputs (commit — this is the evidence)
Extend `tools/harness/AB-FINDINGS.md` (or `SALIENCE-FINDINGS.md`): a lift-vs-salience table
(S0→S3) with CIs, distinguishability per rung, the ceiling verdict, and a plain-language call on
delivery-problem vs foundational-problem + the recommended shippable rung. Artifacts gitignored.

---

## Phase 4 — forced-choice identification with a DIFFICULTY GRADIENT ✅ DONE — subscription-only
> **RESULT (read IDENT-FINDINGS.md):** the 7-way line-up does NOT recover graded identity — overall
> **0.204 ≈ chance 0.143**, with the judge collapsing **48% of all picks onto `cold-extreme`** and
> **never** picking "default" (stock-Claude control → default 0/18). NOT the expected rising curve
> (warm-extreme, the farthest persona, scores 0.111). Two real causes: (1) base Claude's own strong
> cold/analytical persona (`r_B`) dominates outputs and biases the judge; (2) the renderer's effect is
> ASYMMETRIC — cold injections amplify the base (land cold), warm injections fight it and lose (warm
> souls never read as warm). **Synthesis across phases:** the renderer encodes COARSE identity (binary
> contrast → 100% in 3.5) and the ul is noticeable (Phase 3), but FINE multi-class identity is swamped
> by the base model's persona. Also fixed this phase: `--strict-mcp-config` on all headless calls so
> they never boot MCP servers (was spiking CPU load to ~28; now ~4). Tuned the verdict logic to be
> chance/bias-aware (mean-tier + modal-pick detection), so it no longer reports a false gradient.

(historical Phase-4 spec below)

## Phase 4 spec (historical)
Phase 3.5 already proved the easy end: two max-contrast souls → forced-choice **3/3 = 100%**, so the
renderer DOES encode distinct identity and the forced-choice probe is sensitive enough to read it.
Phase 4 fills in the whole curve — vary how distinct each persona is and measure how recognition
degrades, so we learn the **distinctiveness threshold** (how far from default a soul must sit to be
reliably identifiable), not just "extremes work."

**The probe (per souled response):** show the blind judge the response + a line-up of N
**independently-worded** behavioral descriptions (one per candidate persona, synthesized in neutral
language from each persona's aspect vector — NOT the renderer's own prose, so it's behavior-inference,
not surface phrase-matching) + a **"just default Claude / no distinct personality"** option. Ask
"which persona produced this?" Score accuracy vs chance (1/(N+1)).

**The difficulty gradient — independent variable = distance from the empirical base persona `r_B`**
(the measured base-Claude vector already in `judge.ts`). Construct a ladder of test personas at
controlled L2 distances from `r_B` (build Souls with chosen disposition `v`):
- **2 EXTREME** — far from `r_B`, opposite poles, clearly distinct from EACH OTHER (e.g. one
  warm/expressive/open, one cold/rigid/withdrawn). Expect ~easy (Phase 3.5 already saw 100%).
- **2 NEAR-DEFAULT** — barely off `r_B` (small nudge on a couple aspects). Expect ~chance — the floor.
- **2–3 MIDDLE** — moderate distance, the interesting part of the curve.

**What the curve tells us:**
- Accuracy RISES with distance-from-`r_B` (extremes easy, near-default at chance) → **fidelity is REAL
  but graded**; report the threshold distance for reliable identification + a confusion matrix (which
  souls get mistaken for which). This is the expected outcome given Phase 3.5 — quantify it.
- Accuracy FLAT even for extremes → contradicts Phase 3.5; re-examine the probe.

**Hold constant:** deliver at **S1** (the noticeability-winning rung; optionally S3 ceiling for an
upper bound), arms=sonnet, judge=haiku, the 6-prompt battery, k=3, blind, randomized line-up order,
cache everything, strip `ANTHROPIC_API_KEY`. Reuse the Phase-2/3/3.5 rig.

## Outputs (commit — the evidence)
`tools/harness/IDENT-FINDINGS.md` (or append): the accuracy-vs-distance table/curve (per persona:
L2 distance from `r_B` → identification accuracy vs chance), the confusion matrix, the distinctiveness
threshold, and a plain-language verdict (graded-fidelity + threshold vs flat-null) + recommended next move.

---

## Phase 5 — clean 2-way-per-tier discrimination ✅ DONE — subscription-only
> **RESULT (IDENT-FINDINGS.md, Phase-5 section):** the behavioral signal is REAL but **one-directional**.
> Balanced cold@α-vs-warm@α 2-way, n=36/tier: **combined accuracy never clears 0.5 with CI** (0.61/0.58/0.64,
> lower bounds <0.5) — but the decomposition is decisive: **cold-true 0.89→0.94→1.00** (rises with
> separation, genuine graded signal) vs **warm-true 0.33→0.22→0.28** (below chance, FLAT). The judge
> reads almost everything as cold → the two directions cancel. This confirms Phase 4's asymmetry as the
> ceiling: base Claude's own cold/analytical persona dominates; cold injections amplify it (read
> strongly + gradedly), warm injections fight it and lose even at max separation. Phase 3.5's 100% was
> small-n (k=1) on warmth-salient prompts; the robust n=36 picture over a neutral-task battery is
> asymmetric. **Usable claim is coarse + direction-aware.** Next: fight the base for warm souls
> (S2/S3 embodiment), probe emotionally-salient prompts, or test a less-cold base model.

(historical Phase-5 spec below)

## Phase 5 spec (historical)
Phase 4's 7-way line-up was confounded (modal cold-bias + overlapping same-direction tiers), so it
couldn't answer the actual threshold question. Phase 5 strips the confound to a clean **balanced
binary**: at each distance tier, pit ONE cold soul against ONE warm soul and ask the blind judge
which of the two produced the response. This isolates "how far apart must two souls sit before they're
reliably told apart" AND cleanly exposes the warm/cold asymmetry.

**Design — reuse the Phase-4 personas (cached):** `cold@α` vs `warm@α` for α ∈ {0.2 near, 0.6 middle,
1.0 extreme}, where the pair SEPARATION grows with α (near = close pair → hard; extreme = far pair →
easy). For each tier:
- Collect S1 responses from BOTH souls (cached from Phase 4) over the 6-prompt battery, k=3.
- **2-way forced choice ONLY** — judge sees the response + exactly the two persona descriptions
  (cold@α, warm@α), independently worded from `JUDGE_DIMENSIONS` (not renderer prose), randomized
  A/B order. No "default" option, no other distractors. Chance = 0.5.
- **Report accuracy THREE ways per tier:** combined, **cold-true only**, and **warm-true only**. The
  split is the whole point — pure modal bias would show as cold-true≈high / warm-true≈low / combined≈0.5;
  genuine discrimination shows combined ≫ 0.5; residual asymmetry shows as a cold/warm gap even when
  combined > 0.5.

**What the curve gives:** accuracy-vs-tier (the **distinctiveness threshold** = the separation at
which combined accuracy first clears chance with CI), plus the asymmetry gap per tier.

**Verdict to produce:**
- Combined rises above chance by some tier → fidelity is REAL and graded; report the threshold pair-
  separation and whether typical birth-seeded souls clear it.
- Cold-true ≫ warm-true throughout → the base-persona asymmetry is confirmed as the dominant ceiling.

**Hold constant:** S1 delivery, arms=sonnet, judge=haiku, 6-prompt battery, k=3, blind, randomized
order, cache everything, strip `ANTHROPIC_API_KEY`. Reuse the Phase-2/3/4 rig + cache.

## Outputs (commit — the evidence)
`tools/harness/IDENT-FINDINGS.md` (append a Phase-5 section) or `PAIRWISE-FINDINGS.md`: the
accuracy-vs-tier table (combined / cold-true / warm-true, each with CI vs 0.5), the threshold
separation, the asymmetry gap, and a plain-language verdict + recommended next move.

---

## Phase 6 — emotional-prompt warm check ✅ DONE — subscription-only
> **RESULT (IDENT-FINDINGS.md Phase-6) — THE BIG ONE: warmth is INDUCIBLE; Phase-5's asymmetry was a
> battery artifact.** Same 2-way test, only the battery swapped to emotional prompts. warm-true leaps
> 0.33/0.22/0.28 (neutral) → **0.72/0.72/0.89** (emotional, Δ +0.39/+0.50/+0.61); the asymmetry FLIPS
> sign (neutral cold≫warm → emotional warm≥cold); cold-true drops (1.00→0.56). Combined now clears
> chance and is graded (0.50→0.67→0.72, threshold ≈ sep 1.26). **Conclusion: the renderer encodes
> graded, BIDIRECTIONAL identity; which direction SURFACES is context-dependent — neutral/coding
> prompts afford cold, emotional prompts afford warm.** The Phase-2/3 lift-null + Phase-4/5 cold-only
> asymmetry were measurement/battery artifacts (near-neighbor souls + noisy recoverTraits + a neutral
> battery), NOT an inert renderer or a hard base ceiling. Honest product framing: the ul colors how
> Claude engages, context-appropriately. New: `EMOTIONAL_BATTERY` + `pairwise:emotional`.

(historical Phase-6 spec below)

## Phase 6 spec (historical)
Phase 5 found warm souls unreadable (warm-true 0.33/0.22/0.28, below chance) — BUT the battery was
coding/neutral-task-heavy, where warmth has no room to surface. Phase 6 settles the biggest open
ambiguity: **is warmth genuinely uninducible (a real ceiling), or just invisible on neutral tasks
(an expected, fine limitation)?** Re-run the EXACT Phase-5 2-way-per-tier test, changing ONLY the
battery to emotionally-salient prompts.

**Design — identical to Phase 5 except the battery:**
- New **emotional battery** (~6 prompts, fixed + versioned) where warmth/expressiveness actually
  surface: e.g. comforting someone who failed, giving hard personal advice, navigating a conflict,
  reacting to good/bad news, "how are you feeling about X", an apology. NO coding/analytic tasks.
- Same personas: `cold@α` vs `warm@α`, α ∈ {0.2 near, 0.6 middle, 1.0 extreme}.
- Same 2-way balanced forced choice (response + the two descriptions, randomized, no default).
- Report **warm-true / cold-true / combined per tier WITH CI**, placed **side-by-side with the
  Phase-5 neutral-battery numbers** for a direct comparison.

**The verdict this produces:**
- Warm-true RISES above chance on emotional prompts → warmth is **inducible when context gives it
  room**; the Phase-5 asymmetry was largely a battery artifact → much more positive picture (the ul
  expresses fully on context-appropriate prompts). Report the warm-true lift (emotional − neutral).
- Warm-true STILL flat/below chance even on emotional prompts → **genuine ceiling**: Claude's base
  persona swamps warmth regardless of context. Report it plainly.
- Cold-true should stay high on emotional prompts too (sanity control).

**Hold constant:** S1 delivery, arms=sonnet, judge=haiku, k=3, blind, randomized order, cache
everything, strip `ANTHROPIC_API_KEY`. Reuse the Phase-2→5 rig; only the prompt set changes.

## Outputs (commit — the evidence)
`tools/harness/IDENT-FINDINGS.md` (append Phase-6) or `EMOTIONAL-FINDINGS.md`: the per-tier table
(warm/cold/combined ± CI) on the emotional battery **next to** the Phase-5 neutral numbers, the
warm-true emotional−neutral delta, and a plain verdict: warmth inducible-with-context vs genuine
base-persona ceiling + recommended next move / product framing.

## Status
Status: ready-to-merge

## Verification (Phase 6)
- Build: pass (`tsc -b`) · Boundaries: pass · Tests: pass (281, unchanged) · Lint: changed files clean
- Emotional pairwise: DONE — subscription-only, `--strict-mcp-config`, arms=sonnet/judge=haiku, 3 tiers
  × (cold vs warm) × 6 EMOTIONAL prompts × k=3 (108 fresh responses + 108 fresh 2-way judge calls).
  Numbers in `IDENT-FINDINGS.md` (Phase-6 section), side-by-side with Phase-5 neutral. `pnpm … run pairwise:emotional`.
- Scope kept: yes — only the battery changed (new `EMOTIONAL_BATTERY`); rig + personas reused.

## Verification (Phase 5)
- Build: pass (`tsc -b`) · Boundaries: pass · Tests: pass (281, unchanged) · Lint: changed files clean
- Pairwise run: DONE — subscription-only, `--strict-mcp-config`, arms=sonnet/judge=haiku, 3 tiers ×
  (cold vs warm) × 6 prompts × k=3, balanced 2-way (responses reused from Phase-4 cache; only the ~108
  2-way judge calls fresh). Numbers in `IDENT-FINDINGS.md` (Phase-5 section). `pnpm … run pairwise`.
- Scope kept: yes. Reused the Phase-4 personas + `identifyPersona` + cache.

## Verification (Phase 4)
- Build: pass (`tsc -b` clean) · Boundaries: pass · Tests: pass (281, unchanged — runs have no `.test.ts`)
- Lint: changed files clean
- Ident run: DONE — subscription-only, `--strict-mcp-config` (no MCP boot), arms=sonnet/judge=haiku,
  6 personas × 6 prompts × k=3 + 18 controls, blind 7-way line-up. Numbers in `IDENT-FINDINGS.md`.
- CPU fix: committed (`cd020c3`) — headless calls never boot MCP servers; 8-wide holds load ~4.
- Scope kept: yes.

## Verification (Phase 3 — historical)
- Build: pass (`tsc -b` clean)
- Tests: pass (281 — fakeJudge suite + merged mcp; the A/B + salience + live judge have no `.test.ts`, never run in CI)
- Boundaries: pass (`pnpm check:boundaries` clean — harness never imports `plugin`)
- Lint: changed files clean (`biome check` on the new/edited harness files)
- Salience sweep: DONE — subscription-only (`ResponseCollector` + `ClaudeCliClient`, `ANTHROPIC_API_KEY`
  stripped), arms=sonnet / judge=haiku, S0→S3 × 7 subjects × 6 prompts × k=3. S0 reproduced the Phase-2
  null exactly (cache-reused). Numbers in `tools/harness/SALIENCE-FINDINGS.md`.
- Diagnostic (Phase 3.5): DONE — max-contrast souls, forced-choice judge, 3/3 = 100%. `pnpm … run diagnostic`.
- Scope kept: yes. Refactored shared rig into `ab-core.ts`; `abrun.ts` (Phase 2) still works unchanged.

## Result (the headline — read SALIENCE-FINDINGS.md)
**Salience sweep (two-axis):** *noticeability* is a real DELIVERY win — 2-arm distinguishability jumps
**0.33 (S0) → 0.71 (S1)** when the voice enters the conversation channel; *target-fidelity via the lift
metric* stays ~0 at every rung incl. the ceiling.

**Phase 3.5 max-contrast diagnostic reframes the null: THE RENDERER WORKS.** Two opposite souls
(INTJ-cold vs ENFP-warm), forced-choice judge → **3/3 = 100%** attribution (incl. a swapped trial).
So the Phase-2/3 lift-null was NOT an inert renderer — it was (a) the test souls being too similar
(random seeds near base Claude) and (b) `recoverTraits` being a far noisier instrument than a
forced-choice contrast. Recommended: ship **S1** delivery (noticeability), and re-measure fidelity
with **distinct souls + a forced-choice target-match comparator**, not raw `recoverTraits`.

## Final notes (for the merger / next brick)
- Reported plainly per the mission (the foundational null is NOT papered over). Single most important
  next step before touching the renderer: a **forced-choice target-match probe** — `recoverTraits`
  resolution (~0.15) ≈ the effect (~0.17), so it may under-read fidelity that 2-arm hints exists. If a
  better probe still shows null → it's the renderer (Layer-1 rulebook produces generic, not
  discriminative, voice; cf. Phase-1 amplification finding).
- Free win folded in: `EMPIRICAL_BASELINE` (measured `r_B`, not 0.5) committed in `judge.ts`.
- Phase 1 (real judge / live run / FINDINGS.md) + Phase 2 (AB-FINDINGS.md) deliverables unchanged.
- All run artifacts (`.ab-*`, `.salience-*`, `.judge-cache.json`, `.live-run.*`) gitignored. The merge
  of `main` (mcp/skill/lockfile) is on this branch.
