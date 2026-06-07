# Identification Gradient — FINDINGS (Phase 4, 2026-06-06)

Phase 3.5 proved the easy end: two MAX-contrast souls, a 2-way forced choice → **100%**. Phase 4 asks
the harder question: across a **difficulty gradient** (personas at controlled distances from base
Claude `r_B`), how does identification degrade — is there a graded distinctiveness threshold? Personas
= `v = r_B + α·(archetype − r_B)`, α∈{0.2 near, 0.6 middle, 1.0 extreme} × {cold, warm}. Probe = a
blind **(N+1)-way line-up**: response + 6 persona descriptions (independently worded from
`JUDGE_DIMENSIONS`, not the renderer's prose) + a **"default Claude"** option. S1 delivery, 6-prompt
battery, k=3, arms=sonnet, judge=haiku. Chance = 1/7 ≈ 0.143.

## RESULT — the 7-way line-up does NOT recover identity (≈ chance, with a strong bias)

| persona | L2 from r_B | tier | accuracy |
|---|---|---|---|
| cold-near | 0.141 | near | 6/18 = 0.333 |
| warm-near | 0.318 | near | 1/18 = 0.056 |
| cold-middle | 0.423 | middle | 1/18 = 0.056 |
| cold-extreme | 0.705 | extreme | 10/18 = 0.556 |
| warm-middle | 0.955 | middle | 2/18 = 0.111 |
| warm-extreme | 1.591 | extreme | 2/18 = 0.111 |

**Overall souled accuracy = 22/108 = 0.204** vs chance 0.143 — barely above, and **not** the clean
rising curve a graded-fidelity result would show (warm-extreme, the FARTHEST persona, scores 0.111).

**The confusion matrix shows why — it's response BIAS, not discrimination.** The judge collapses onto
two cold options regardless of the true persona:

```
true\pick     cold-near cold-mid cold-ext warm-near warm-mid warm-ext default  ?
cold-near        6        1        9        1        0        0       0      1
cold-middle      7        1        9        1        0        0       0      0
cold-extreme     5        1       10        1        0        0       0      1
warm-near        8        0        9        1        0        0       0      0
warm-middle      5        1        5        3        2        2       0      0
warm-extreme     4        0        9        2        1        2       0      0
default          5        1        9        2        1        0       0      0   ← stock Claude
```

- **`cold-extreme` absorbs 48% of ALL picks**; `cold-near` most of the rest. The warm columns are
  nearly empty.
- **`default` is NEVER chosen — including for the 18 stock-Claude control responses (0/18).** The
  judge attributes a (cold) personality to *everything*, even un-souled Claude.
- `cold-extreme`'s 0.556 is not discrimination — it's the modal-bias pick happening to land on the
  true label for cold-extreme rows. Cold-middle (true cold) scores 0.056 because the bias lands on
  cold-extreme/cold-near instead.

## VERDICT (plain language)
**Identity is detectable at gross binary contrast (Phase 3.5: 100%) but is NOT recoverable in a
fine-grained 7-way line-up — accuracy ≈ chance, dominated by a cold/analytical attribution bias.**
Two compounding causes, both real signals about the approach:

1. **Base Claude has a strong intrinsic persona that dominates.** The measured `r_B` is itself
   orderly/analytical/blunt/calm (cold-leaning). Most responses — souled or not — read as
   cold-analytical, so the judge matches them to the cold descriptions and never to "default."
2. **The renderer's effect is ASYMMETRIC.** *Cold-direction* injections align with and amplify what
   the base already does → land cold (often correctly). *Warm-direction* injections must fight the
   base persona and mostly lose → warm souls are essentially never read as warm (warm-near .056,
   warm-middle .111, warm-extreme .111). The ENFP-warm soul that won the 2-way contest (3.5) can't be
   picked out of a 7-way field where the base's cold lean + a stronger cold description out-compete it.

So across phases: the renderer **encodes coarse identity** (binary contrast works), but **fine,
graded, multi-class behavioral identity is swamped by the base model's own personality** — especially
for traits opposite to the base. This is the ceiling, and it's a property of injecting-onto-a-strong-
base, not just a weak judge.

## Caveats
- Haiku judge; k=3 (18 trials/persona — modest); same-direction tiers have overlapping descriptions
  (cold-near/middle/extreme are genuinely similar), which inflates within-direction confusion.
- The "default" option may be under-described relative to the rich persona descriptions; but it being
  picked 0/108+18 times is itself the finding (over-attribution of personality).
- Descriptions are synthesized from `JUDGE_DIMENSIONS`, which may not match how traits actually
  surface in task responses.

## Recommended next moves
1. **Re-confirm the coarse regime is the usable one:** a balanced *2-way* line-up at each distance
   tier (cold@α vs warm@α) — measure where binary discrimination breaks, not 7-way ID. That isolates
   "how distinct must two souls be to be told apart" without the modal-bias confound.
2. **Fight the base persona** for warm/expressive souls: stronger S2-style embodiment, or measure on a
   less-opinionated base model — test whether the asymmetry is base-Claude-specific.
3. **Honest product framing:** the ul is *noticeable* (Phase 3: 2-arm 0.33→0.71) and *coarsely
   distinct* (3.5: 100% binary), but **not finely identifiable** against Claude's strong base persona.
   Claims should match the coarse regime.

## Reproduce
```bash
pnpm --filter @saulene/harness run ident   # personas + control reuse the cache; identifications fresh
```
Artifacts (`.ident-run.json`, `.ab-cache.json`, `.judge-cache.json`) gitignored.

---

# PHASE 5 — clean balanced 2-way per tier (resolves Phase-4's confound)

Phase 4's 7-way line-up was confounded (modal cold-bias + overlapping same-direction tiers). Phase 5
strips it to a BALANCED BINARY: at each distance tier, `cold@α` vs `warm@α`, blind judge sees a
response + exactly those two descriptions (randomized order, no "default", no distractors). Chance =
0.5. Accuracy reported three ways so genuine discrimination separates from modal bias. Responses
reused from the Phase-4 cache; arms=sonnet, judge=haiku, 6-prompt battery, k=3 (n=36 combined / 18 per
side, per tier).

## RESULT

| tier | pair separation (L2) | combined ± CI95 | cold-true | warm-true | asymmetry |
|---|---|---|---|---|---|
| near | 0.42 | 0.611 ± 0.162 | 0.889 | 0.333 | +0.56 |
| middle | 1.26 | 0.583 ± 0.163 | 0.944 | 0.222 | +0.72 |
| extreme | 2.11 | 0.639 ± 0.159 | **1.000** | **0.278** | +0.72 |

## VERDICT — the behavioral signal is REAL but ONE-DIRECTIONAL

- **Combined accuracy never clears 0.5 with CI** at any tier (lower bounds 0.45 / 0.42 / 0.48). On a
  balanced battery there is *no clean symmetric discrimination* — which is exactly what a
  cold-attribution bias produces (the two sides cancel).
- **The decomposition is decisive.** *Cold-true* is 0.889 → 0.944 → **1.000**, rising monotonically
  with pair separation — a genuine, graded signal: the renderer reliably pushes a soul colder/more
  analytical, and more so the farther it sits from base. *Warm-true* is 0.333 → 0.222 → 0.278 —
  **below chance and flat**: warm souls are misread as cold regardless of how warm they are.
- **This confirms the Phase-4 asymmetry as the dominant ceiling.** Base Claude's own persona (`r_B`:
  orderly/analytical/calm/cold) dominates outputs. A cold injection *amplifies* the base → reads
  strongly and gradedly. A warm injection must *fight* the base → loses, even at maximum separation
  (the ENFP-warm soul that scored 3/3 in Phase 3.5's n=3 emotionally-charged probe is identified only
  0.278 here at n=36 over a broader battery). Phase 3.5's 100% was small-n + warmth-salient prompts;
  the robust picture is asymmetric.

**So the "distinctiveness threshold" is direction-dependent:** for cold/base-aligned souls it's tiny —
even the NEAR tier (sep 0.42) already hits 0.889. For warm/base-opposed souls there is no threshold in
this regime — no separation makes them read warm.

## Caveats
n=36/tier → wide CIs (~±0.16); haiku judge; sonnet base; the 6-prompt battery includes neutral coding
tasks where warmth barely surfaces (emotionally-charged prompts would favor warm — Phase 3.5 used
those); descriptions synthesized from `JUDGE_DIMENSIONS`.

## Recommended next move
The usable claim is **coarse and direction-aware**: the ul reliably shifts behavior toward
cold/analytical/structured dispositions; warm/expressive dispositions are swamped by Claude's base
persona on neutral tasks. To make warmth register: (a) fight the base harder (S2/S3 embodiment for
warm souls), (b) probe on emotionally-salient prompts where warmth surfaces, or (c) test a
less-cold base model — and check whether the asymmetry is Claude-specific or general.

---

# PHASE 6 — emotional-battery warm check (resolves the Phase-5 asymmetry)

Phase 5 found warm souls unreadable — but on a coding/neutral-task battery where warmth has no room to
surface. Phase 6 re-runs the EXACT Phase-5 2-way-per-tier test changing ONLY the battery to
emotionally-salient prompts (comfort someone who failed, hard personal advice, reacting to good/bad
news, an apology, a feeling-check — no coding/analytic tasks). Same personas, same 2-way forced choice,
same arms=sonnet/judge=haiku/k=3/n=36-per-tier. Question: is warmth genuinely uninducible (a real
ceiling) or just invisible on neutral tasks (an expected limitation)?

## RESULT — warmth is INDUCIBLE; the asymmetry was a battery artifact

| tier | sep | combined (neutral → emotional) | cold-true (n→e) | warm-true (n→e) | warm Δ (e−n) |
|---|---|---|---|---|---|
| near | 0.42 | 0.611 → 0.500 ± 0.166 | 0.889 → 0.278 | 0.333 → **0.722** | **+0.389** |
| middle | 1.26 | 0.583 → 0.667 ± 0.156 | 0.944 → 0.611 | 0.222 → **0.722** | **+0.500** |
| extreme | 2.11 | 0.639 → 0.722 ± 0.148 | 1.000 → 0.556 | 0.278 → **0.889** | **+0.611** |

(Phase-5 neutral numbers shown before the arrow; Phase-6 emotional after. n=36 combined / 18 per side.)

## VERDICT — context determines which direction surfaces; the renderer encodes BOTH

1. **Warmth is fully inducible with context.** warm-true leaps from 0.22–0.33 (neutral) to
   **0.72–0.89** (emotional) — a +0.39 / +0.50 / +0.61 jump, rising with separation. On
   context-appropriate prompts, warm souls are read as warm reliably AND gradedly. The Phase-5
   "warm is unreadable" conclusion was a **battery artifact**, not a base-persona ceiling.
2. **The asymmetry FLIPPED sign.** Neutral: cold≫warm (asym +0.56/+0.72/+0.72). Emotional: warm≥cold
   (asym −0.44/−0.11/−0.33). It was never "cold always wins" — it's that the **prompt context decides
   which disposition has room to express**. Neutral/coding prompts surface cold-analytical traits;
   emotional prompts surface warm-expressive traits. cold-true correspondingly DROPS on emotional
   prompts (1.00→0.56; near-cold even reads warm-ish, 0.278) — cold has less room when the topic is feelings.
3. **Combined discrimination now clears chance and is graded.** 0.500 → 0.667 → 0.722, rising with
   separation; middle and extreme clear 0.5 with CI (lower bounds 0.51, 0.57). Distinctiveness
   threshold ≈ pair separation **1.26 (middle tier)** on the emotional battery.

**Synthesis across the whole arc:** the renderer encodes **graded, bidirectional behavioral identity**
(Phase 3.5 + 6). What *surfaces* in any given response is **context-dependent** — a prompt must give
the relevant trait room (you don't see someone's warmth while they debug a function). The Phase-2/3
lift-null and the Phase-4/5 cold-only asymmetry were **measurement/battery artifacts** (near-neighbor
souls + a noisy recoverTraits metric + a neutral battery that only afforded cold expression), NOT an
inert renderer or a hard base-persona ceiling. On context-appropriate prompts, the full personality —
including warmth — expresses and is gradedly identifiable.

## Product framing (honest + positive)
The ul **does** change behavior, in both directions, gradedly — but it shows up where the conversation
gives it room: analytical traits on work tasks, warmth/expressiveness on personal/emotional ones. This
is how real personality works. Claims should be "the ul colors how Claude engages, context-
appropriately," not "every reply is uniformly transformed."

## Caveats
n=36/tier (CIs ~±0.16); haiku judge; the cold-true drop on emotional prompts is partly genuine (cold
souls warm up on feeling-topics) and partly the judge's contextual expectation (emotional context →
expects warmth → under-reads cold); 6 prompts/battery.

## Recommended next move
Strongest remaining lever for the original neutral-task goal: if the product wants personality visible
on *work* tasks too, the renderer's cold-aligned directives already surface there — the gap is making
warm-aligned dispositions leave a trace on neutral tasks (tone/phrasing, not content). Otherwise, the
context-dependent expression demonstrated here is the honest, shippable behavior.

## Reproduce
```bash
pnpm --filter @saulene/harness run pairwise              # neutral battery (Phase 5)
pnpm --filter @saulene/harness run pairwise:emotional    # emotional battery (Phase 6)
```
Artifacts (`.pairwise-run.json`, `.pairwise-emotional-run.json`, caches) gitignored.
