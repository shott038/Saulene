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
