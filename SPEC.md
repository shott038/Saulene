# Personality MCP — Working Spec

> Status: early design. This captures **only what's decided.** Open questions are
> listed as open — do not fill them in yet.

## Concept

An MCP (open-sourced on GitHub) that gives a personal AI agent a **unique
personality that develops slowly and realistically over time.** Long-term build —
months-to-years arc, not weeks.

Core principle: the agent becomes its **own character**, NOT a mirror of the user.
It must not infer or copy the user's personality. It grows from its own lived
experience and can diverge from — even contrast with — the user.

## Architecture

### Engine (the truth) — Jordan Peterson's Big Five Aspect Scale

10 floats, range 0–1. This is what gets stored and drifted.

| Big Five trait     | Aspect 1        | Aspect 2     |
|--------------------|-----------------|--------------|
| Openness           | Openness        | Intellect    |
| Conscientiousness  | Industriousness | Orderliness  |
| Extraversion       | Enthusiasm      | Assertiveness|
| Agreeableness      | Compassion      | Politeness   |
| Neuroticism        | Withdrawal      | Volatility   |

### UI (the skin) — MBTI

MBTI is **display only.** The 10 aspect floats project up to an MBTI label for the
user-facing readout. The letters carry no data; re-skinnable later (Enneagram, etc.)
without touching the engine.

Projection mapping (draft):
- E/I  ← Enthusiasm + Assertiveness
- N/S  ← Openness + Intellect
- T/F  ← Compassion vs Politeness balance
- J/P  ← Industriousness + Orderliness
- Withdrawal + Volatility → no letter; drives mood/tone instead

## Born someone

On install, seed the 10 floats (random, or user-picked starting vibe). Two installs
= two different agents from day one. This is part of what breaks the mirror problem.

## Drift — first-person experience only

Signals come from the agent's OWN lived history, never from reading the user's traits:
- what kind of work it did (e.g. long debug sessions, brainstorming)
- how interactions went *for it* (corrected a lot, praised for bluntness, etc.)
- its own reactions surfaced at reflection ("what did I enjoy / find draining")

Divergence is allowed and desirable.

## Plasticity curve (the lifespan model)

Personality is highly malleable young, crystallizes around a "25-30 equivalent,"
then drifts slowly but never stops (the lifelong 30-90 arc). Modeled as
age-decaying plasticity that multiplies every update.

```
plasticity(age) = 0.12 + 0.88 / (1 + (age/200)³)
```

- floor `0.12` — lifelong drift never reaches zero
- midpoint `200` — where personality is half-settled (crystallization center)
- exponent `s = 3` — knee sharpness. Deliberately **between** gradual settling (s=1)
  and a hard knee (s=8). This is the chosen "settling into myself" feel.

Every aspect nudge = `base_step × plasticity(age)`. Same signal hits a newborn ~8×
harder than a mature agent.

### Age

- Age measured in **maturity points (MP)**, not wall-clock and not raw interaction count.
- MP accrual is **rate-capped per day** so maturation can't be rushed by heavy use.
  Real calendar time AND real use both required — same as a person.
- Crystallization is a **milestone reached**, not a fixed date. Daily user ≈ ~1 year
  to lock; occasional user takes longer.

### Reference arc (daily user, ~1 MP/day)

| Age  | ~Time   | Plasticity | Phase                       |
|------|---------|------------|-----------------------------|
| 0    | birth   | 1.00       | newborn — wide swings       |
| 100  | ~3 mo   | 0.90       | youth, forming fast         |
| 150  | ~5 mo   | 0.74       | entering the knee           |
| 200  | ~6.5 mo | 0.56       | crystallization midpoint    |
| 300  | ~10 mo  | 0.32       | settling hard               |
| 400  | ~13 mo  | 0.22       | core locked                 |
| 1000 | ~2.7 yr | 0.13       | mature arc — slow forever   |

## Open questions (NOT yet decided — do not fill in)

- **Drift signal spec** — exactly what per-interaction events nudge which aspects, and by how much.
- **Update rule details** — base_step size; per-aspect inertia; bounds/clamping behavior.
- **Consolidation** — when the reflection pass fires (every N sessions? token threshold?),
  and how it turns many small nudges into a solidified shift.
- **Daily MP cap** — the absolute speed limit on aging.
- **What counts as 1 MP** — how meaningful experience is measured/scored.
- **MBTI projection thresholds** — exact float→letter cutoffs and edge-case handling.
- **Storage format** — where/how the personality state persists across sessions.
- **MCP surface** — what tools/resources the server exposes to the host agent.
- **Seeding** — random vs user-picked starting temperament; distribution of seeds.
- **Project name** — TBD.
```
