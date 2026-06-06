# A/B Behavioral Validation — the proof-of-life experiment (PLANNED)

**Status:** planned, not yet built. Build *after* the in-flight worktrees land
(`real-judge-tuning`, `plugin-mcp-ul`). This is the experiment that converts the project's
central bet — *"the injected voice actually changes how the model behaves"* — from a design
argument into a measured number with a control.

## The question
Does installing the ul plugin causally shift the model's behavior toward the ul's target
personality, relative to the same model with no plugin? And by how much (effect size), with a
real control rather than an *assumed* neutral baseline?

## Design — Option B (inject-equivalent A/B + control)
The plugin's ONLY behavioral mechanism is prepending `render(soul).text` to the system prompt
(via the SessionStart hook). The statusline/MCP never touch completions. So we reproduce the
plugin's exact behavioral input without the install plumbing: same base model, same prompts,
toggle only the injection. The two arms receive **byte-identical input to what the real hook
feeds** — this is the mechanism, not an approximation. (A full plugin-install run is a separate,
later integration smoke test, not the measurement.)

Per soul:
- **Arm A (treatment):** system prompt = `<baseline context>` + `render(soul).text`
  → run each battery prompt → collect responses.
- **Arm B (control):** system prompt = `<baseline context>` only (NO injection)
  → same battery prompts → collect responses.
  The control is **soul-independent → run ONCE and reuse** across all souls/stages (cheap).

The only difference between arms is the ul injection — that isolates it as the cause.

## Comparison — the blind Judge is the comparator
Reuse the LLM-backed `Judge` built by the `real-judge-tuning` worker (`recoverTraits` /
`guessAuthor` / `embed`). The Judge is **blind**: never sees `soul.v`, never told which arm a
response came from; order randomized; any plugin "tells" stripped.

1. **Trait recovery → lift.** Judge recovers the 10 aspect values from each arm's responses.
   - `r_A(soul)` = recovered vector for treatment; should land near `target = soul.v`.
   - `r_B` = recovered vector for control = the **empirical base-Claude persona** (one vector,
     reused). This REPLACES the harness's currently *assumed* `BASELINE = 0.5 everywhere`, which
     is almost certainly wrong.
   - **Lift = dist(r_B, target) − dist(r_A, target).** Positive ⇒ injection moved behavior
     toward the target vs. baseline. Report aggregate + per-aspect. Lift ≈ 0 ⇒ the plugin does
     nothing (the result we most need to be able to detect — this design makes it falsifiable).
2. **Distinguishability.** Blind 2-arm: can the Judge pick which response set "has a
   personality"? And cross-soul attribution with a **"no-plugin" candidate added** — can it tell
   a souled ul apart from stock Claude?
3. **Effect size + honesty.** Sample `k` completions per prompt at a fixed temp; report mean lift
   with a CI / simple permutation test. No single-sample hand-waving.

## Prompt battery
Start from the existing `PROMPT_BATTERY` (5 self-report probes) but EXPAND it: the honest test is
whether personality leaks into **ordinary task prompts** (write code, debug, explain a concept),
not just "how do you react when…" self-report. Self-report over-elicits; neutral tasks are the
harder, more realistic probe. Keep the set fixed + versioned.

## Souls under test
A handful of distinct souls (≈4–8) spanning the type space, plus life-stage snapshots
(young/adult/old) pulled from `tools/simulator` trajectories — so we also test whether an *older*
ul behaves measurably differently from a young one.

## Where it lives / boundaries
- Dev-only tooling: extend `tools/harness` with a model-in-the-loop A/B runner (e.g.
  `abrun.ts`) + a response collector that calls the base model. Injection text comes from the
  REAL `@saulene/renderer` `render(soul)`.
- `core` / `renderer` stay PURE. All LLM IO lives in the dev-only harness.
- **Never in CI / default `pnpm test`** — real model calls cost money + are non-deterministic.
  Gate behind an explicit script + `ANTHROPIC_API_KEY`. The `fakeJudge` suite stays the CI default.

## Outputs (commit these — this run is the evidence)
- The empirical base-Claude persona vector `r_B` (and feed it back as the harness's calibrated
  baseline, replacing 0.5).
- Per-soul + aggregate lift with CI; distinguishability rate; per-aspect breakdown.
- A plain-language verdict on the central bet.

## Dependency note
`real-judge-tuning` builds the LLM `Judge` (the comparator) — its output is the FOUNDATION for
this experiment, not superseded by it. That worktree is being **held unmerged** pending this plan
so its judge can be reconciled into the A/B runner deliberately.
