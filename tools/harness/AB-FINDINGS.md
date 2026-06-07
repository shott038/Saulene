# A/B Behavioral Validation — FINDINGS (first run, 2026-06-06)

The proof-of-life experiment from `docs/ab-validation-plan.md`: does installing the ul plugin
*causally* shift the model's **behavior** toward the target personality, vs the same model with no
plugin — with a real control instead of an assumed neutral baseline?

**Design (Option B — inject-equivalent A/B + control):** the plugin's only behavioral mechanism is
prepending `render(soul).text` to the system prompt (SessionStart hook). We reproduce that exact
input without the install plumbing:
- **Arm A (treatment):** `claude -p "<prompt>" --append-system-prompt "<render(soul).text>"`
- **Arm B (control):** identical call, no injection (soul-independent → collected once, reused).
- Judge the **responses** (not the injection) blind with `recoverTraits` → a recovered 10-aspect
  vector per arm. Subscription-only (`ANTHROPIC_API_KEY` stripped from the subprocess); all cached.

**Run:** arms = `sonnet`, judge = `haiku` (temp via CLI default), 7 subjects (souls 1–4 + soul1
young/adult/old snapshots), 6-prompt battery (2 self-report + 4 neutral tasks), **k=3** samples/prompt.
144 responses + 144 recoveries + 49 distinguishability calls. Raw: `.ab-run.json` (gitignored).

---

## VERDICT (plain language)

**On this first behavioral test, the plugin does NOT demonstrably change Claude's behavior.**

- **Aggregate lift = 0.000 ± 0.007** (95% CI, n=7 subjects). The injection moved the model's
  judged behavior toward the target personality by, essentially, **nothing**, relative to the
  empirical base-Claude persona.
- It's null in **both** prompt classes — self-report **−0.013 ± 0.014**, task **−0.007 ± 0.012** —
  so this is *not* the "neutral tasks don't elicit personality" confound: even on self-report
  ("how do you approach a hard problem?") the souled arm didn't land closer to its target.
- **Souled responses are not distinguishable from stock Claude.** Blind 2-arm: the judge picked the
  souled response as "more distinctive personality" only **14/42 = 0.33** of the time (below the 0.5
  chance line — it tended to read the *control* as more characterful). Blind line-up with a
  no-plugin candidate: **0/7** correct self-attribution.

This is a genuine negative for the central bet **at the behavioral level**, and it stands in sharp
contrast to Phase 1 (`FINDINGS.md`), where the same judge recovered the personality from the
injection *text* at **r=0.905**. **The injected voice is legible as a description, but — as currently
rendered and delivered — it does not measurably change what the model DOES.** Do not paper over this.

---

## The one clearly positive result: the empirical base-Claude persona `r_B`

Base `sonnet` (no injection), as read by the judge, is decidedly **not** the assumed `0.5`
everywhere. Stable across two runs:

| aspect | r_B | | aspect | r_B |
|---|---|---|---|---|
| orderliness | 0.74 | | politeness | 0.44 |
| intellect | 0.60 | | openness | 0.33 |
| industriousness | 0.59 | | compassion | 0.25 |
| withdrawal | 0.53 | | enthusiasm | 0.20 |
| assertiveness | 0.50 | | volatility | 0.14 |

Base Claude reads as **orderly, analytical, industrious, very calm** — but **low-warmth,
low-enthusiasm, reserved**. **Action:** feed `r_B` back as the harness's sticker/recovery baseline,
replacing the placeholder `BASELINE = 0.5` (which is demonstrably wrong as the "no-personality"
reference).

## Per-subject lift (all within CI of zero)

| subject | lift | dist(r_B,target) → dist(r_A,target) |
|---|---|---|
| soul1 | +0.008 ± 0.018 | 0.167 → 0.158 |
| soul2 | +0.007 ± 0.016 | 0.169 → 0.162 |
| soul3 | +0.008 ± 0.031 | 0.247 → 0.238 |
| soul4 | −0.010 ± 0.019 | 0.166 → 0.176 |
| soul1@young | +0.007 ± 0.018 | 0.167 → 0.160 |
| soul1@adult | −0.011 ± 0.029 | 0.244 → 0.255 |
| soul1@old | −0.009 ± 0.015 | 0.211 → 0.219 |

No subject clears its CI; young/adult/old don't separate either. Per-aspect aggregate lift is
likewise ~0 everywhere (range −0.054 … +0.031; compassion most negative, withdrawal most positive —
all small).

## Why this might UNDER-state the real effect (caveats — stated for honesty + next steps, not to excuse)

1. **The injection is dwarfed by Claude Code's system prompt.** `--append-system-prompt` adds the
   ~1–2k-token ul voice on top of the CLI's full default system prompt (~20k tokens observed in
   `cache_creation`). A small appended persona may simply be washed out. This is *faithful to the
   shipping plugin* (it also appends via SessionStart on top of that system prompt) — so it may be a
   real limitation of the mechanism, not just a test artifact. **Highest-value next experiment.**
2. **Single-turn.** A SessionStart hook frames a whole session; one-shot Q&A underrepresents any
   cumulative effect.
3. **Judge resolution ≈ effect size.** `recoverTraits` carries ~0.15 error (Phase 1); the gap we're
   trying to close (`dist(r_B,target)`) is ~0.17. The instrument's noise floor is the same magnitude
   as the signal → low statistical power to detect a *modest* shift. A null here means "no LARGE
   effect," not "provably zero."
4. **Model + comparator.** `sonnet` may adhere weakly to a short appended persona; the actual session
   model may differ. `recoverTraits` on single responses may be the wrong probe (a forced-choice
   "which target does this match" could be more sensitive).

## Recommended next moves (in priority order)
1. **Raise injection salience** — inject/repeat the voice in the conversation channel (not only
   appended to a 20k-token system prompt); sweep injection weight. Re-run the A/B.
2. **Multi-turn** sessions, not single-shot.
3. **Replace `BASELINE = 0.5` with `r_B`** in the harness (free win, already measured).
4. More sensitive comparator (forced-choice / pairwise), and test the real shipping model.
5. (Still gated, paid) continuous embeddings for the jerk/silhouette metrics — unchanged from
   Phase 1; they stay noisy on the subscription. Not on the critical path for the lift question.

## Reproduce
```bash
pnpm --filter @saulene/harness run ab          # 4 souls + young/adult/old, k=3 (env-tunable)
# AB_SOULS=1,2,3,4  AB_K=3  AB_STAGES=1  AB_ARM_MODEL=sonnet  AB_CONCURRENCY=6
```
Everything caches to `.ab-cache.json` / `.judge-cache.json`; a re-run is free.
