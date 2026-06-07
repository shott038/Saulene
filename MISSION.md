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

## Status
Status: ready-to-merge

## Verification
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
