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

## Phase 2 — A/B behavioral validation (IN PROGRESS) — subscription-only, stays free
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

## Status
Status: ready-to-merge

## Verification
- Build: pass (`tsc -b` clean)
- Tests: pass (281 — fakeJudge suite + merged mcp; the A/B + live judge have no `.test.ts`, never run in CI)
- Boundaries: pass (`pnpm check:boundaries` clean — harness never imports `plugin`)
- Lint: changed files clean (`biome check` on the new/edited harness files)
- A/B run: DONE — subscription-only (`ClaudeCliClient` + `ResponseCollector`, `ANTHROPIC_API_KEY`
  stripped), arms=sonnet / judge=haiku, 7 subjects × 6 prompts × k=3. Numbers in `tools/harness/AB-FINDINGS.md`.
- Scope kept: yes.

## Result (the headline — read AB-FINDINGS.md)
**NULL.** Aggregate behavioral lift = **0.000 ± 0.007** (95% CI, n=7) — the injection did not move the
model's judged behavior toward the target. Null in both self-report (−0.013) and task (−0.007) slices.
Souled responses not distinguishable from stock (2-arm 0.33, below chance; line-up 0/7). This contrasts
sharply with Phase 1 (judge recovers personality from the injection TEXT at r=0.905): the voice is
legible as a description but does not change what the model DOES, as currently rendered/delivered.
Positive byproduct: the empirical base-Claude persona `r_B` (NOT 0.5) — feed it back as the harness baseline.

## Final notes (for the merger / next brick)
- The null is reported plainly per the mission. Strongest confound + next experiment: the ~1–2k-token
  injection competes with Claude Code's ~20k-token system prompt (`--append-system-prompt`) → likely
  diluted; raise injection salience (conversation-channel / repeat / weight) and re-run. Also: judge
  resolution (~0.15) ≈ the effect size (~0.17), so this rules out a LARGE effect, not a small one.
- Phase-1 deliverables (real judge, live run, FINDINGS.md) are unchanged and still valid.
- All run artifacts (`.ab-cache.json`, `.ab-run.json`, `.ab-run.log`, `.judge-cache.json`,
  `.live-run.*`) are gitignored. The merge of `main` (mcp/skill/lockfile) is included on this branch.
