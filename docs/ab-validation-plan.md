# A/B Behavioral Validation — the proof-of-life experiment (DONE)

**Status: ✅ DONE (2026-06-07).** Built + run (subscription `claude -p`) in `tools/harness`.
**Verdict: the central bet holds** — the ul demonstrably, graded-and-bidirectionally, changes
Claude's behavior, surfacing context-appropriately (warmth shows on emotional prompts: warm-true
0.22–0.33 → 0.72–0.89). Early nulls were measurement artifacts (noisy probe, near-neighbor souls,
coding-only battery). Full results: `tools/harness/AB-FINDINGS.md`, `SALIENCE-FINDINGS.md`,
`IDENT-FINDINGS.md`. Two banked wins folded into the product: **S1 delivery** (0.33→0.71
noticeability) and the empirical **`r_B`** baseline. Original design below.

---

This is the experiment that converts the project's
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

## Transport: drive the local Claude Code subscription, NOT the metered API
Both arms AND the judge run through the local `claude` CLI in headless mode, so the whole run is
covered by the user's Claude Code subscription — zero metered API spend. This also means we test
the *actual shipping model*, not an API stand-in.

- **Response collection (the two arms), per battery prompt:**
  - Arm A (treatment): `claude -p "<prompt>" --append-system-prompt "<render(soul).text>" --model <m> --output-format json`
    — `--append-system-prompt` is the faithful analog of the real SessionStart hook (it adds the ul
    voice on top of Claude Code's normal system prompt).
  - Arm B (control): identical call with NO `--append-system-prompt`.
  - Disable tools for clean conversational answers (e.g. `--disallowedTools` / restrictive
    `--permission-mode`); parse the response text out of the JSON envelope.
- **Judge**: same `claude -p ... --output-format json` with a system prompt instructing it to rate
  the 10 behavioral dimensions 0–1 and emit JSON (behaviorally anchored, no trait names).
- **Subscription auth, not API key:** ensure `ANTHROPIC_API_KEY` is NOT present in the subprocess
  env (it would route to metered billing). Strip it from the spawned env so the CLI uses the
  logged-in subscription.
- **No embeddings endpoint on the subscription.** The subscription CLI has no `embed`. So for the
  embed-based metrics (trajectory / stage-silhouette / ablation) substitute the **judge's recovered
  10-aspect vector** as the embedding — semantically the right space anyway. The `Judge.embed`
  port stays, backed by `recoverTraits` under the hood for the subscription build.
- **Rate/throughput:** subscription has usage limits; keep N souls × P prompts × k samples modest
  for the first run, prefer sequential (or low parallelism) calls, and cache responses (the judge
  worker's `cache.ts`) so re-runs don't re-spend quota.

## Where it lives / boundaries
- Dev-only tooling: extend `tools/harness` with a model-in-the-loop A/B runner (e.g.
  `abrun.ts`) + a response collector that shells out to the `claude` CLI. Injection text comes
  from the REAL `@saulene/renderer` `render(soul)`. Built as the CONTINUATION of the
  `real-judge-tuning` branch (the live-run harness already lives there) — NOT a parallel worktree,
  to avoid two workers editing `tools/harness/` at once.
- `core` / `renderer` stay PURE. All LLM IO (CLI subprocess) lives in the dev-only harness.
- **Never in CI / default `pnpm test`** — real model calls are non-deterministic + consume the
  subscription. Gate behind an explicit script. The `fakeJudge` suite stays the CI default.

## Outputs (commit these — this run is the evidence)
- The empirical base-Claude persona vector `r_B` (and feed it back as the harness's calibrated
  baseline, replacing 0.5).
- Per-soul + aggregate lift with CI; distinguishability rate; per-aspect breakdown.
- A plain-language verdict on the central bet.

## Dependency note
`real-judge-tuning` builds the LLM `Judge` (the comparator) — its output is the FOUNDATION for
this experiment, not superseded by it. That worktree is being **held unmerged** pending this plan
so its judge can be reconciled into the A/B runner deliberately.
