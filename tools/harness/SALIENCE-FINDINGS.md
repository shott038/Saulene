# Salience Sweep — FINDINGS (Phase 3, 2026-06-06)

Phase 2 found a behavioral **null** with the shipping mechanism (voice `--append-system-prompt`'d
onto Claude Code's ~20k-token system prompt). This sweep answers: **delivery problem** (the voice is
washed out) or **foundational problem** (the voice doesn't drive behavior even undiluted)? It varies
*how the same voice is delivered*, holding everything else constant (souls 1–4 + soul1 young/adult/old,
6-prompt battery, k=3, control `r_B`, judge=haiku, arms=sonnet, blind, cached, no API key).

`lift = dist(r_B, target) − dist(r_A, target)` — positive ⇒ responses moved toward the soul's target
personality vs the empirical base persona. `2-arm` = blind "which response has a distinct personality,
souled or stock?" (0.5 = chance).

## The table

| rung | delivery | lift ± CI95 | self-report | task | 2-arm |
|---|---|---|---|---|---|
| **S0** | append to system (shipping) | **0.000 ± 0.007** | −0.013 | −0.007 | 0.33 |
| **S1** | voice in user turn | **0.004 ± 0.016** | 0.013 | −0.010 | **0.71** |
| **S2** | user turn + reinforcement | **0.009 ± 0.013** | 0.022 | −0.005 | 0.67 |
| **S3** | system REPLACE (ceiling, diagnostic) | **−0.002 ± 0.016** | −0.012 | −0.008 | 0.64 |

## VERDICT (plain language) — it's BOTH, on two different axes

**Target-fidelity: FOUNDATIONAL null.** Lift does not clear its CI at **any** rung — including the
**ceiling (S3, −0.002 ± 0.016)**, where the voice IS the entire system prompt with zero competition.
If dilution were the whole story, removing the 20k-token competitor would move the lift; it doesn't.
**So the rendered voice does not steer behavior toward the *specific* target personality, even
undiluted.** That is a foundational signal about the rendering, not a delivery-tuning gap — report it
plainly.

**Noticeability: a real DELIVERY win.** Distinguishability is the opposite story. At S0 the judge
picks the souled response only **0.33** of the time (below chance — stock Claude reads as *more*
characterful). The moment the voice moves into the conversation channel it jumps to **0.71 (S1)** and
stays well above chance (0.67 / 0.64). So delivery *was* washing the voice out — **of noticeability**:
in the user channel the voice is reliably perceptible as "this assistant has a distinct personality."

**The gap between the two is the headline:** salience makes the ul **noticeable but not itself**. The
model picks up *be characterful* from a high-salience injection, but not *be THIS character* in a way
the trait-recovery judge can read back. Personality leaks as generic flavor, not as the encoded 10-vector.

## Recommended shippable rung
- **For noticeability: S1 (voice in the user/conversation channel).** Cheapest rung that lifts 2-arm
  decisively above chance (0.33 → 0.71); S2's reinforcement adds nothing over S1 (0.67) and S3 isn't
  shippable. If the goal is "the ul feels present," ship S1-style delivery, not S0 append-to-system.
- **For target-fidelity: no rung qualifies.** None produces measurable target-aligned behavior. Do
  not ship a claim that the ul makes Claude behave like the specific soul — the data doesn't support it.

## Per-subject ceiling (S3) — heterogeneous, still ~0
soul1 −0.030, soul1@young −0.033 (negative); soul2 +0.016, soul3 +0.016, soul4 +0.016, soul1@old
+0.007, soul1@adult −0.007. No subject clears its CI; the souls whose targets sit near `r_B` even go
slightly negative. No young/adult/old trend.

## Why the lift might under-read (caveats — stated for honesty, same as AB-FINDINGS)
1. **Judge resolution ≈ effect size.** `recoverTraits` carries ~0.15 error; `dist(r_B,target)` ≈ 0.17.
   The binary 2-arm question is far easier than recovering 10 calibrated numbers — which is exactly why
   2-arm catches the (generic) effect while lift stays flat. A more sensitive *fidelity* probe
   (forced-choice "which of these N target personas does this response match?") might detect a signal
   the 10-number recovery can't. This is the single most important methodological caveat.
2. **Single-turn**; a session-long hook may compound.
3. **Model = sonnet**; the shipping model may adhere differently.
4. Generic-vs-specific is itself the finding, not only an artifact: even granting (1), the ceiling
   moving 2-arm but not lift is real and consistent.

## Recommended next moves (priority order)
1. **Fix the comparator before re-judging the renderer.** Add a forced-choice target-match probe
   (does the response match soul X over souls Y/Z?) — disambiguates "judge can't read fidelity" from
   "no fidelity exists." Cheap, subscription-only, reuses this rig.
2. **If fidelity is still null with a better probe → it's the renderer.** The Layer-1 rulebook
   produces generic characterfulness; the directives may need to be more behaviorally *discriminative*
   between souls (cf. Phase-1's amplification finding — mid-range traits all read near-pole, collapsing
   distinctions). This is the foundational work.
3. **Ship S1-style delivery regardless** — it's a free, measured noticeability win over S0.
4. Multi-turn + the real shipping model for an integration check.

## Free win folded in
`EMPIRICAL_BASELINE` (the measured base-sonnet `r_B`, not 0.5) is committed in `judge.ts` and used as
the no-personality reference. Base Claude: orderly/analytical/industrious, low-warmth/low-enthusiasm/calm.

## Reproduce
```bash
pnpm --filter @saulene/harness run salience   # S0 reuses the Phase-2 cache; S1–S3 fresh; all cached
```
Artifacts (`.salience-run.json`, `.ab-cache.json`, `.judge-cache.json`) gitignored.
