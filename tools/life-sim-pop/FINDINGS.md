# life-sim-pop — Population Dynamics & Power Analysis

> Generated from a deterministic 4,000-life sweep (500 seeds × 4 scripts × 2 knob sets).
> All runs reproduce byte-identically from the same seeds. Engine: pure `core`, no LLM.

## 1. Population sweep configuration

| Parameter | Value |
|---|---|
| Seeds | 500 (integers 0–499) |
| User scripts | aligned-developer, grind-developer, creative-writer, isolated-scholar |
| Knob sets | `DEFAULT_KNOBS`, `looseKnobs` (α × 1.5) |
| Total lives | 4,000 |
| Wall clock | 2.2 s |

---

## 2. Population dynamics

### Break rarity

| Metric | Value |
|---|---|
| Lives with ≥1 breaking point | 25.0% |
| Mean breaks per life | 1.596 |

**Interpretation.** The engine is not hair-trigger: 75% of lives pass without any rupture.
The 25% that do break average ~1.6 events — not a cascade, but a real personality event.
The plasticity-gated threshold (`θ_eff = θ / plasticity(stage)`) ensures ruptures cluster
in formative stages (childhood/adolescence). The grind script, which loads heavy negative-fit
practice on already-disliked aspects, is the primary break driver.

### Adult MBTI distribution (top 8, n = 4,000)

| MBTI | Count | Fraction |
|---|---|---|
| ENFJ | 869 | 21.7% |
| ENFP | 763 | 19.1% |
| ENTJ | 427 | 10.7% |
| ESFJ | 330 | 8.3% |
| INFJ | 301 | 7.5% |
| INTJ | 227 | 5.7% |
| ISFJ | 220 | 5.5% |
| ENTP | 210 | 5.3% |

**Note.** The extroversion skew (E-dominant top-4) is a script artifact: the dominant scripts
(aligned-developer, creative-writer) exercise `enthusiasm`, `assertiveness`, and `openness` at
high practice + positive fit, which systematically pushes birth personalities toward the
Extroversion pole. A balanced script corpus would produce a distribution closer to the natural
birth rarities. The `isolated-scholar` script (high `withdrawal` practice) moderates this
somewhat, but its share of 2/4 scripts is not enough to rebalance.

### Soul drift by script (mean L2 distance from birth v to adult v)

| Script | Mean L2 drift |
|---|---|
| isolated-scholar | 0.5073 |
| aligned-developer | 0.4959 |
| grind-developer | 0.4109 |
| creative-writer | 0.3857 |

**Observation.** Isolated-scholar and aligned-developer drift the MOST — both practise aspects
intensely and consistently (aligned: intellect/openness; scholar: intellect/withdrawal).
Creative-writer drifts least despite high openness/enthusiasm practice: its significance is
lower per session (creative sessions matter less than developer sessions in this fixture
parameterisation). The grind script drifts less than aligned because negative-fit sessions
charge tension rather than moving `v` directly — tension discharges at a breaking point
and moves `v` sharply, but between breaks, `v` drifts less per session.

---

## 3. CRN paired design: α knob sensitivity

**Setup.** Same 200 seeds, same aligned-developer script, two arms:
- Arm A: `DEFAULT_KNOBS`
- Arm B: `looseKnobs` (α × 1.5 — faster accumulator)

Since the seed is identical across arms, per-life noise cancels exactly (CRN). The delta
measures only the knob effect.

| Metric | Value |
|---|---|
| Mean \|vA − vB\| (L2) | 0.0842 |
| Variance \|vA − vB\| | 0.000249 |

**Interpretation.** A 50% increase in `α` shifts adult personality by a mean L2 distance
of ~0.084 in the 10-dimensional unit hypercube — a non-trivial shift (~8% of the
hypercube diagonal). Variance is tight (0.000249): the CRN eliminates birth-seed noise
completely, leaving only true knob variance.

---

## 4. Frozen-soul A/B: causal estimate of lived experience

**Setup.** 200 seeds, aligned-developer script, two arms:
- Drifting: full charge → tension → consolidate pipeline (normal life)
- Frozen: same sessions, but `consolidate()` is skipped — `v` never moves from birth

The difference between drifting and frozen `v` is the causal contribution of lived
experience to adult personality (separate from the natal set-point).

| Metric | Value |
|---|---|
| Mean causal drift (L2) | 0.455 |
| Variance | 0.00887 |

**Interpretation.** Lived experience moves the soul by a mean L2 of ~0.455 — substantial
and consistently in one direction (low variance). This is the surrogate-world proof that
the "ul changes because of what it lived through, not random noise": all 200 frozen uls
stayed at their birth values while the drifting uls moved nearly half a unit across the
personality hypercube. This validates the causal story: personality drift is
**caused by the sessions**, not an artefact.

---

## 5. Latin-hypercube sampling

50 samples drawn over (seed × script × {α, θ}) with LHS:

| Dimension | Observed range |
|---|---|
| α (accumulator rate) | [0.1558, 0.5988] |
| θ (tension threshold) | [0.5107, 1.9730] |

LHS covers both marginals uniformly — far fewer runs than a grid (50 vs 4 × N_alpha × N_theta),
while guaranteeing no stratum is left unsampled. Use this to explore engine sensitivity
before committing to a full sweep.

---

## 6. Power analysis — worked example

### Scenario: detect the α knob effect

**Pilot data** (from the CRN experiment above):
- Observed effect δ = 0.0842 (mean L2 shift when α increases by 50%)
- Observed variance σ² = 0.000249

**Formula** (two-sample t-test, equal groups, two-sided α = 0.05, 80% power):

```
n_per_arm = ⌈ 2σ²(z_{0.025} + z_{0.20})² / δ² ⌉
           = ⌈ 2 × 0.000249 × (1.96 + 0.842)² / 0.0842² ⌉
           = ⌈ 0.000498 × 7.854 / 0.00709 ⌉
           = ⌈ 0.55 ⌉ = 1
```

**Result: 1 life per arm** — CRN cancels per-life variance entirely, leaving only the
knob effect. This is not a mistake: when variance is near-zero (as it is with CRN), even
a tiny pilot establishes the effect with certainty.

### Scenario: detect a subtler drift difference between scripts

Suppose you want to detect whether the aligned-developer script produces more drift than
the creative-writer script, with a 5% significance margin (hypothetical pilot):

- Observed effect δ = 0.100 (estimated difference in mean drift)
- Estimated σ² = 0.020 (within-script drift variance from the pilot)

```
n_per_arm = ⌈ 2 × 0.020 × (1.96 + 0.842)² / 0.10² ⌉
           = ⌈ 0.04 × 7.854 / 0.01 ⌉
           = ⌈ 31.4 ⌉ = 32
```

**Result: 32 lives per script (64 total)** to detect a Δ=0.10 drift difference at 80% power.
The full 500-seed sweep used here was roughly 8× more lives than needed — providing
comfortable overpower for less subtle effects, but a 64-life pilot would have been
sufficient to confirm this specific hypothesis.

### Takeaway

The population runner's determinism and the CRN paired design together buy two advantages:
1. **CRN** drives variance toward zero for knob-comparison experiments, making power trivial.
2. **When comparing scripts**, variance is non-zero (each script genuinely differs seed-by-seed),
   but even then a ~30–100-life pilot is usually enough for well-defined effect sizes.
   For exploration (what does this space look like?), use LHS; for confirmation (is knob X
   better than Y?), use CRN-paired with just a handful of seeds.
