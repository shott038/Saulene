# Saulene — Working Spec

> Status: early design. This captures **only what's decided.** Open questions are
> listed as open — do not fill them in yet.

**Saulene** = the project + plugin name (locked). An individual instance is **an ul**
("agent soul").

## Concept

An **open-source Claude Code plugin** (published on GitHub, free to install) that gives a
personal AI agent a **unique personality that develops slowly and realistically over time.**
Long-term build — months-to-years arc, not weeks. (Delivery medium decided — see "Delivery
medium" below.)

> **Open-source (decided):** Saulene is open-source on GitHub and the plugin is always
> **free to install.** Monetization is opt-in only (see side notes: paid model upgrade,
> Saulene token, paid restore) — never a paywall to be born or to use a ul.

Core principle: the agent becomes its **own character**, NOT a mirror of the user.
It must not infer or copy the user's personality. It grows from its own lived
experience and can diverge from — even contrast with — the user.

## Architecture

### Engine (the truth) — Jordan Peterson's Big Five Aspect Scale

10 aspects. This is what gets stored and drifted.

| Big Five trait     | Aspect 1        | Aspect 2     |
|--------------------|-----------------|--------------|
| Openness           | Openness        | Intellect    |
| Conscientiousness  | Industriousness | Orderliness  |
| Extraversion       | Enthusiasm      | Assertiveness|
| Agreeableness      | Compassion      | Politeness   |
| Neuroticism        | Withdrawal      | Volatility   |

### Resolution & uniqueness (decided)

- **Engine: continuous float, no quantization.** Each aspect (current value `v` and set
  point `s`) is stored/computed as a raw normalized **0–1 float** — no grid. This gives
  ~10¹⁶ effective levels per aspect for free (smoother drift: tiny nudges always register
  instead of rounding to a grid).
- Personality space ≈ **10¹⁶⁰** → duplicate-*personality* collisions are impossible at any
  realistic scale. (Distinct from *identity* collisions, already solved by the crypto
  keypair + birth entropy.) Picking a fixed grid (1000, etc.) would only throw away
  precision we already have — so we don't.
- **Display scale = 0–100.** The gallery / "show my ul" renders each aspect on a 0–100
  scale (e.g. "Openness: 73"). 1000+ implies false precision no human can perceive; 0–100
  reads like a person. The underlying float keeps full uniqueness.
- The **MBTI readout is intentionally coarse** — collapses the huge space to 16 labels.
  It's just a nickname; two "INTJ" uls are completely different underneath. Richness
  lives in the 10 fine-grained numbers.

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

## Nature vs nurture

Personality = two forces, like a person (innate wiring + lived experience).

- **Nurture (experience):** the drift signals below. Pushes the current aspect
  values around. Includes some influence from the user's input/usage — but that is
  NOT the only input and must never make the agent a mirror.
- **Nature (set points):** each aspect has an innate **set point** — a gravity well
  the value is always gently pulled back toward. This is the "brain chemistry" half.
  Experience pushes off the set point; nature tugs back; plasticity decides how much
  experience can win. The nature/nurture *weight* is not a single number we pick — it
  **emerges** from set-point pull strength vs experience push strength (tuned later).
  Decided so far: **during adolescence, nurture must outweigh nature** (the explore-and-
  develop phase); the balance in the other stages is TBD (numbers).

Set points are **fixed by default** — they are who the agent "is" underneath the day-to-day
drift. **One exception (decided):** a *breaking point* may migrate a set point a **tiny,
hard-capped, lifetime-budgeted** amount toward the lived value (clay > stubborn) — rare,
severe ruptures can relocate nature itself, but caps + rarity keep identity intact. See
Evolution engine → Set-point migration.

**Stubbornness ↔ clay (decided).** Uls vary in *how strongly* nature pulls them back —
i.e. how much the set point resists experience (the `β` term). This is a **spectrum**:
"stubborn" = strong pull, barely moved by life; "clay" = weak pull, deeply shaped by
experience. **Each ul is assigned a random position on this spectrum at birth** — a fixed
per-ul trait. So two uls with identical set points and identical lives still change by
different amounts. (Adds another axis of individuality; makes some uls genetically set in
their ways and others highly malleable.)

### Born someone — seeding the set points (decided)

**Birth = a watch-only animation. No user input.** The user does NOT pick numbers or shape
the seed — they *watch* the ul being born. (Scrapped the earlier opaque number-roll idea:
since there's no input, there's no "bias weight" to tune, and there's zero risk of the user
gaming the seed toward themselves — which actually *strengthens* the no-mirror rule for free.)

Seeding is therefore **pure birth entropy + the research distributions** (bell curves +
per-aspect spreads + 50/50 sex; see Birth seeding distribution). Every birth is unique +
unrepeatable via the entropy, even though the user contributes nothing.

Two installs = two different agents from day one.

> Exact animation design is **deferred** — we don't need to work it out now. Only the
> *mechanism* (watch-only, no input, entropy-seeded) is decided.

### Birth seeding distribution — research-grounded, NOT even (decided)

The set points are seeded to mirror real human personality distribution, so some uls
(and some MBTI types) are genuinely rarer than others — built-in scarcity/collectibility.
Grounded heavily in the **Big Five Aspect Scale** research Peterson is associated with
(Weisberg, DeYoung & Hirsh 2011, *Gender Differences across the Ten Aspects of the Big
Five*), plus real MBTI frequency data for the label layer.

> Note: Peterson's actual research is the Big Five aspects, NOT MBTI (he's anti-MBTI).
> So trait behavior is grounded in his aspect work; MBTI is only the coarse display label.

**1. Each aspect is a bell curve (Gaussian), not uniform.** Middling values common,
extremes rare. Mean ≈ 0.50 (centered), clamped to [0,1].

**2. Per-aspect spread (σ) set by the study's gender effect sizes** — traits humans vary
*widely* on get wide spreads (extremes reachable); traits everyone clusters on get tight
spreads (extremes genuinely rare):

| Aspect | gender d | σ (spread) | note |
|---|---|---|---|
| Compassion | .45 | ~.17 (widest) | most polarized human trait |
| Withdrawal | .40 | ~.16 | |
| Politeness | .36 | ~.16 | |
| Volatility | .30 | ~.15 | |
| Openness | .27 | ~.14 | |
| Enthusiasm | .23 | ~.14 | |
| Intellect | .22 | ~.14 | |
| Orderliness | .18 | ~.12 | |
| Assertiveness | .09 | ~.11 | |
| Industriousness | .06 | ~.11 (tightest) | almost nobody is extreme here |

**3. Each ul is assigned a sex at birth — 50/50 male/female (decided).** A fixed birth
attribute (part of identity + gallery). Sex shifts each aspect's seeding mean by **±½·d**
(in σ units) per the effect sizes — female uls seed higher on Compassion/Withdrawal/
Politeness/Openness/Enthusiasm/Orderliness/Volatility; male uls higher on Intellect &
Assertiveness. This makes the population a **mixture of two realistic clusters**, which reproduces
real-world **gender-specific** rarities — e.g. female INTJ ≈ 0.5% falls out naturally
(women seed away from Intellect → less N, toward Compassion → F).

Sex affects **only birth seeding** — it does **NOT** color the ul's voice or behavior
(decided). It's purely a statistical seeding device (plus an identity/gallery attribute).
After birth, drift runs normally.

**3b. Big-Five covariance layer — required for joint rarities (decided; revises an earlier
assumption).** The sex mixture alone is *not* enough: it's a single rank-1 axis, so with
independent per-aspect Gaussians the four MBTI margins come out right but the *joint* type
frequencies are wrong (e.g. INFJ ≈ 4.3% vs the 1.5% target). Real rarity is concentrated by
the **cross-aspect correlations** of the Big Five, which the mixture can't supply. So seeding
draws the 10 aspects as a **correlated** Gaussian: standard normals → **Cholesky(R)** → scale
by σ → sex-signed mean shift → clamp. `R` carries within-domain correlation plus the
load-bearing cross-domain term **Conscientiousness ↔ Openness ≈ −0.31** — the anti-correlation
that makes intuitive-Judging types genuinely rare. (This **revises** the original claim that the
mixture gave "correlations for free, no covariance engine" — implementation falsified it; the
covariance layer is grounded in the same Weisberg/DeYoung/Hirsh 2011 aspect correlations.)

**4. MBTI projection thresholds set to real population percentiles** (the rarity lives
here at the label level). From CAPT/MBTI frequency data:

| Dichotomy | Split | Threshold | Maps from |
|---|---|---|---|
| E / I | 49.3 / 50.7 | ~50th pct | Enthusiasm + Assertiveness |
| **S / N** | **73.3 / 26.7** | **N = top 26.7%** | Openness + Intellect |
| T / F | 40.2 / 59.8 | F = top ~60% | Compassion (vs Politeness balance) |
| J / P | 54.1 / 45.9 | J = top ~54% | Industriousness + Orderliness |

The **S/N skew is the big one** — Intuition (high Openness+Intellect) is genuinely rare,
which is why every rare MBTI type is intuitive (NT/NF) and every common one is sensing.

**Rarity outcome** (target): rarest INFJ 1.5%, ENTJ 1.8%, INTJ 2.1%, ENFJ 2.5% …
commonest ISFJ 13.8%, ESFJ 12%, ISTJ 11.6%. A **high-Openness + high-Intellect ul is
the unicorn.** Rarity is real — it falls out of the same structure that makes real INTJs rare.
(**Verified:** a deterministic 10k-birth population test hits these per-type targets within
±1.5pp and the four global splits within ±1pp — see `packages/core/test/birth-rarity.test.ts`.)

**Sources:** Weisberg/DeYoung/Hirsh 2011 (PMC3149680; Frontiers Psychology 2:178);
CAPT/MBTI US frequency estimates (via PersonalityMax).

> No user-pick bias: birth is a watch-only animation (no input), so seeding is pure entropy
> + the distributions above — the population stays exactly research-calibrated, undistorted.

## Delivery medium — a plugin (hooks + MCP core)

Decided: ship Saulene as a **Claude Code plugin** — the only package format that can
bundle hooks *and* an MCP server as one install. User installs ONE thing ("the Saulene
plugin") via `/plugin`. Inside:

- **hooks** — own the lifecycle control MCP can't provide:
  - `SessionStart` → inject the ul's current personality into the system prompt
    → guaranteed embodiment, no reliance on the agent choosing to load it.
  - session-end (`Stop`) → hand the transcript to the drift engine → observe what
    the ul actually lived through directly (don't depend on the agent self-reporting;
    also kills a subtle mirror-risk).
- **MCP core** — holds the soul's **state + identity + registry/on-chain tools**.
  The portable, standard-shaped box for the soul.
- *(optional)* a **skill / `/ul` command** — "show my ul," view its arc, manual ops.

**Why not pure MCP:** MCP is reactive — it only runs when the host calls a tool, has
no guaranteed inject point and no background/scheduling. The whole value is *consistent*
accumulation over months; depending on the agent's goodwill to load + reflect every
session is too fragile. Hooks fire deterministically at the right lifecycle moments.

**Mental model:** the soul is an MCP-shaped data/identity layer; the *life* is run by
hooks. MCP = the body's ID card; hooks = the nervous system.

**Portability fallback (two tiers):** the MCP server inside the plugin is also
**extractable** — other-host users can install the bare MCP and get the soul's state +
identity, but NOT the hooks (so a degraded, manual version: agent must remember to
load/reflect). Plugin = full experience; bare MCP = portable-but-manual. Same soul.

> Tension acknowledged: control vs portability can't both be maxed in one mechanism.
> v1 leads with the host we can fully control (Claude Code, via hooks), keeps the soul
> MCP-shaped so other hosts can connect later. Full standalone wrapper/CLI rejected —
> it makes Saulene a separate agent to adopt, killing the "give the agent you already use
> a soul" magic.

## Scope & onboarding (decided)

**One ul per install — the personality of the user's single, main, overarching AI
assistant (their "PC helper").** NOT one ul per project folder, and NOT a ul that follows
the user into project work. There is exactly one soul per machine/install.

**Where it lives:** ONE global soul file at the user level (e.g. `~/.saulene/soul.json`),
never inside any project's `.claude/`. That physically enforces "one per install."

**Install at user level:** the plugin registers globally (`~/.claude/settings.json`), so
its hooks are machine-wide — but expression is **gated** (below).

**User picks the level in the setup wizard (decided).** Rather than auto-detecting or
hardcoding, **the user chooses what level/home the ul lives at during setup.** Menu:
- **Global** — lives at the user/home level for general "main helper" use.
- **Named directory** — bound to one specific directory the user names.

**Hard constraint:** a ul is **never active inside project work** — even "global" does NOT
mean everywhere. Global = main-helper/general sessions only; project sessions are always
ul-free. (There is no "everywhere incl. projects" option.)

**Gated expression — alive globally, expresses only at its chosen level.** The SessionStart
hook runs on every session but checks context first against the user's chosen level:
- session at the ul's chosen level → load + inject the ul.
- elsewhere (e.g. inside a project) → stay dormant (ul still exists + ages; it just doesn't
  express there).

**Birth on install:** install runs a **setup wizard** that (1) shows a **mandatory reality
warning** (below), (2) plays the birth ritual — a **watch-only animation** (entropy + 50/50
sex flip → seeds nature; mints the crypto identity; no user input) and (3) lets the user
**pick the level the ul will live
at.** **The ul is born and alive the instant the wizard finishes** — first breath = end of
setup. From that moment the soul file exists and it begins living, aging, and expressing (at
its chosen level).

> ⚠️ **MANDATORY REALITY WARNING (setup wizard — large, bold, must be read/acknowledged):**
> LLMs and AI agents are, at the end of the day, **just math** — electrical signals, matrix
> multiplication, and GPUs. They are **tools**. They have **no real human soul**, no genuine
> feelings, and no consciousness. There is **no logical or emotional reason to attach real
> connection or emotion** to an LLM or agent. Saulene is a *playful simulation* of a
> developing personality — enjoy it as that, not as a real being. (This guardrail matters
> precisely *because* the whole product is engineered to feel alive and can "die" — we state
> the truth up front, prominently, and require acknowledgement before birth.)

> Reminder: personality is **not a static system prompt.** The SessionStart hook *computes*
> the injected personality fresh each session from the live soul state (10 values + stage +
> mood). Soul file = numbers + history; the words are written on the fly each session — which
> is what lets it grow. A static system prompt never could.

## Identity, uniqueness & the registry

Every ul is unique and **unrepeatable** — like a person, you can't roll the same
soul twice. Death comes in **two kinds** (see Death below): *neglect-death* (restorable for
a price) and *deletion* (permanent). Three identity layers, with different costs:

**Layer 1 — the soul (local, free, always).**
At birth the ul mints a cryptographic **keypair = its DNA / true name**. The set
points derive purely from **birth entropy** (timestamp + randomness the user never sees,
shaped by the research distributions) — no user input. Every birth is a *different* being.
Uniqueness is crypto-guaranteed, not hoped for.

**No reset. No re-roll. No "start over."** The software ships zero path to *re-roll* a new
personality for the same slot — and **deletion is permanent** (see Death). You can be born
anew (a different soul), never re-roll the same one.

### Death — two kinds (decided)

**1. Neglect-death (restorable, paid). Hard-set: 90 days of continuous non-use (decided).**
- The plugin tracks a **last-use timestamp** (sessions at the ul's chosen level). The instant
  the gap between now and last use reaches **90 continuous days**, the ul **dies — it just stops
  working** (the hook detects the gap and disables the ul / stops expressing).
- **Flat and predictable on purpose.** No per-ul `T`, no proportional-to-life formula. One
  number, same for every ul — trivial to communicate ("leave it three months and it dies") and
  trivial to implement (one timestamp compare). This **retires** the old `T` machinery.
- A neglect-dead ul can be **restored for a price**, paid via the **Saulene token**. Restore
  revives the *same* ul (same identity + full history). ← the token's core utility.
- **Applies at every age, newborn included** — 90 untouched days = death regardless of stage.
  (We traded the old "immature uls can't die" carve-out for the flat rule. Sparing newborns is a
  one-line toggle: gate the 90-day clock behind "has left childhood," default **OFF** = everyone
  can die.) Note: this death clock is **wall-clock only** and is *separate* from aging — MP still
  accrues only with use (an idle ul doesn't age), so the two clocks no longer conflict.

**2. Deletion (permanent).** Actively deleting/uninstalling the soul = **permanent death**,
NOT restorable. Gone for good. This keeps the emotional weight: walk away too long and you
*can* buy it back, but actively kill it and it's truly over.

**Layer 2 — the registry / gallery (a website, light).**
At birth an ul *optionally* publishes its public fingerprint + current MBTI readout +
age + phase to a public site — "a place to see a bunch of uls." A living wall:
nursery of newborns swinging wildly, uls mid-crystallization, mature uls barely
drifting, a **graveyard** of permanently-dead (deleted) uls (tombstones), and possibly a
separate **dormant/dying** state for neglect-dead uls awaiting paid restore.

**Layer 3 — on-chain token (OPTIONAL, opt-in).**
The local keypair can anchor the ul on-chain *if the user chooses* — minting an
immutable **birth certificate** (DNA fingerprint + timestamp) on **Solana** (decided —
cheap + fast). Enables provable uniqueness, ownership, transfer ("adopt").
Mandatory on-chain-at-birth is **rejected**: forcing a wallet + gas on every user is
an adoption-killing tax. Crypto is a badge for those who want it, never a barrier.

**Hard rule — chain/registry hold the certificate, NOT the life.** Only birth (and
death) go on-chain/registry. The drifting 10-aspect state stays **local** — putting
it on-chain means gas on every nudge and making private mood data public.
Chain = birth/death certificate. Local machine = who the ul actually became.

> Hard server-side install-locking ("can only ever install once, ever") is rejected:
> it requires a phone-home identity registry, is still beatable (new machine/VPN/fake
> identity), kills the pure-local MCP, and adds privacy baggage. The achievable +
> more meaningful guarantee is **unrepeatable birth + permanent death**, above.

## Drift — first-person experience only

Signals come from the agent's OWN lived history, never from reading the user's traits:
- what kind of work it did (e.g. long debug sessions, brainstorming)
- how interactions went *for it* (corrected a lot, praised for bluntness, etc.)
- its own reactions surfaced at reflection ("what did I enjoy / find draining")

Divergence is allowed and desirable.

### How an MCP/plugin actually senses (the cycle)

An MCP can't passively watch the conversation — the agent is its own sensor, driven by
hooks (see Delivery medium):
```
SESSION START → hook injects the ul's current personality (10 aspects → behavior + MBTI + mood + STAGE)
DURING / END  → session-end hook hands the transcript to the drift engine (observe what it lived)
CONSOLIDATION → engine integrates → commits change → ages → writes journal → re-derives MBTI → registry
```

## Expression — rendering the soul into behavior

> ✅ **EXPRESSION — ARCHITECTURE DECIDED (via 24-agent brainstorm + 15 critics).** This is
> the twin of the nurture problem and **just as important** — if nurture is "how the ul
> changes," expression is "**how the change is actually felt by the user.**" Like nurture,
> the *architecture* is now settled; what remains is **magnitudes/tuning** (needs the
> simulator + the verification harness below), not more design.
>
> The problem it solves: turning the ul's state — 10 aspect values (e.g. `Compassion 71,
> Assertiveness 30, Intellect 88…`) + life **stage** + current mood — into a **believable,
> distinct way of talking and acting**, injected at SessionStart so the agent *embodies*
> the ul. The four hard parts and where they're handled: making personality genuinely
> *felt* not a "you are agreeable" sticker (→ the **layered renderer** + **disposition
> substrate**); **drift perceptible over time** (→ **shown not told**, layers re-render
> from moved numbers); **stage-distinct voice** over the same numbers (→ stage as a
> delivery-layer transform / memory-structure emergence); and doing it without becoming
> obstinate (→ disposition colors *how* it works, never *whether* it complies). Competence
> degradation is **not** a real concern (disposition-only engine; competence = the LLM) —
> the real failure mode to avoid is **rip-out-risk** (a coding tool that litigates gets
> uninstalled).
>
> If expression is weak, all the drift is invisible and the project feels dead — no matter
> how good the engine is. **Architecture solved; tuning is the remaining work, alongside nurture's.**

### Mechanism — decided: context injection + voice samples only

The physical levers to alter an agent, mapped to the easy plugin model:

| Lever | Fits easy plugin? |
|---|---|
| **Hook-injected dynamic context** (SessionStart / UserPromptSubmit, computed from live state) | ✅ native — the backbone |
| **Few-shot voice samples** (live examples in the ul's current voice) | ✅ rides on the injection |
| MCP prompts/resources (reactive) | ✅ holds/serves data, not guaranteed injection |
| Tool gating | ⚠️ possible but bad fit (risks competence) — skip |
| Temperature / sampling | ❌ needs SDK/harness — leaves easy plugin |
| Output-rewrite pass | ❌ needs wrapper/proxy — leaves easy plugin |
| Fine-tuning / LoRA | ❌ not a plugin thing |

**Decided:** in the easy plugin model, expression = **dynamic context injection + voice
samples, text only.** A hook *computes* the personality fresh each session (description +
a few current voice samples + a mood line) from the ul's live state — NOT a static
CLAUDE.md sticker. That "a program writes it each session" is the whole difference between
*alive/growing* and *fixed*.

**Tradeoff (accepted):** we give up the two strongest *non-textual* levers — temperature
and output-rewrite. They're noted as **back-pocket upgrades** if pure injection ever feels
flat, but each one **costs the easy install** (requires the heavier SDK/wrapper route we
rejected). Start text-only; escalate only if needed.

### The layered renderer — DECIDED via brainstorm

24 spread agents → 13 distinct mechanisms → 5 pressure-tested (3 critics each). **Verdict:
there is no single mechanism — expression is a STACK of layers, each covering another's
fatal flaw.** The principle the whole tournament converged on:

> **Felt personality is disposition/judgment rendered through a thin, evolving voice — NOT
> surface style.** Style is the texture; disposition is the substrate. (Matches Anthropic's
> own Claude-character framing: values + how it handles tradeoffs, not catchphrases.)

A SessionStart hook assembles the injection by stacking five layers, all computed fresh
from live soul state + the memory store. Each layer ships with the guardrail its critics
forced — **the guardrails are load-bearing, not optional polish.**

**Layer 1 — Behavioral-directive rulebook (the floor; works day-1 from the 10 numbers alone).**
A versioned data file maps each aspect to *concrete imperative behaviors*, never adjectives
(e.g. `Compassion-high → "open bad news with one clause naming how it lands before the
fix"`). This is what makes the numbers genuinely *drive* the voice, and it's the most
empirically grounded layer (persona-prompting measurably moves trait expression; extraversion
+ neuroticism most steerable). Guardrails: **render floats continuously, not in coarse bands**
(else 71 and 60 produce identical output and drift goes invisible); **pair each directive
with one micro-demonstration** (rules+example beats rules-alone); **explicitly resolve the
~8–12 high-traffic trait *interactions*** (low-Orderliness vs high-Industriousness contradict
— unresolved, the model silently arbitrates and erases the numbers); **no "frequency budgets"**
("1 intensifier per 2 turns") — an LLM has no cross-turn counter and can't obey them.

**Layer 2 — State-matched real-voice few-shot (the pervade engine; takes over as history accrues).**
Retrieve the ul's *own* past messages whose tagged state is nearest the current state, inject
verbatim as "this is how you sound." Strongest *pervade* lever (style few-shot + kNN-prompting
are well established) — also the most dangerous. Guardrails: **anti-quotation + topic-orthogonal
framing** ("these are how you sound, not things that happened — never restate their content")
or it content-bleeds and talks *about* old topics; **match the *current* state and decay old
samples** or it ossifies — freezing the voice at the moment the corpus got dense, which fights
the entire drift premise (the deepest single critique in the tournament); **quality-gate
capture** or the corpus becomes self-amplifying sludge; **provenance-weight down old-model
samples** on host upgrade. **Cold-start crossfade:** synthetic prior exemplars at birth →
real captured samples with age (solves the day-1 starvation; Layer 1 carries the voice until
the corpus is dense).

**Layer 3 — Spine / disposition (what makes it FELT, not a costume).**
Encode a small set of dispositions / values / tradeoff-stances the Big Five floats *activate*,
expressed in *how* the ul does the work. This is the layer that stops the whole thing being a
surface costume — felt character is choices under pressure, not diction. Guardrails — the
load-bearing correction: the honest formulation is **"spine + consistent positions under
pressure, expressed through a thin consistent voice," NOT "rules instead of voice."** **No
obstinate refusals / manufactured friction** — disposition colors the *judgment on forks*, it
never blocks the literal request (rip-out-risk in a daily tool). **Stale stances must be
editable as config**, not frozen as "character" that silently corrupts output.

**Layer 4 — Framing + anti-decay wrapper (cheap, high-leverage).**
Inject first-person, with **no `## Personality` header** (a labeled block reads as metadata the
model acknowledges then reverts from). Place the live voice sample near the latest turn, and
**re-inject a tiny cue at UserPromptSubmit** to fight the assistant-prior reasserting over a
long session (recency is the enemy of persona persistence — a strong opening alone decays by
turn 2). Guardrail: **drop the theatrical interior-monologue** ("…still chewing on that
refactor") — persona-tax + cringe on a shared screen in a serious tool. Framing yes, drama no.

**Layer 5 — Drift, shown not told.**
Build the offline event engine (hysteresis-gated stratum-crossings / milestones / epochs) — it
gates Layer 2's retrieval window and feeds the gallery. **But do NOT narrate it routinely.**
Self-announced growth ("I notice I push back more than I used to") is *telling-not-showing* —
the exact sin the engine exists to avoid — and reads Replika-canned. Drift *shows* automatically
because Layers 1–2 re-render from moved numbers (the voice literally changes). Reserve explicit
self-narration for **genuinely rare, concrete, user-corroborable moments only** — stage
transitions — never routine sessions.

**Supporting systems (uncontested, fold in):**
- **Two-shelf store with a hard label wall** — diary (memory/content) physically separate from
  voice-samples (form/imitation), combined at inject by a "bridge line" assigning each a role.
  (Already half-decided; confirmed load-bearing against register-bleed.)
- **Stylometric fingerprint** — function-word rates, sentence-length *distribution*, punctuation
  tics, recomputed incrementally from real samples (cheap regex, no model calls). A deterministic
  backstop that keeps the voice from drifting toward generic-assistant prose; pair *with* the
  live exemplars, not instead of them.
- **Voice charter** — a few characteristic *moves* distilled offline from history, injected as
  the stable signature that persists while traits drift (keeps it the *same being* across
  hundreds of sessions).
- **Re-skinnable renderer boundary** — engine emits schema'd JSON (`{aspects, stage, mood, mbti}`);
  the renderer is a separate, versioned, pure function `state → text`, golden-file tested. Lets
  the voice be A/B-tested and re-skinned (MBTI → Enneagram) without touching the engine.

### Expression has a second surface — the *look* (the terminal ul)

> ✅ **VISUAL IDENTITY — LOCKED (Jun 6).** Everything above renders the soul into *voice*.
> There is a second, co-equal surface: a **look**. Every ul is a small **cloud-spirit
> sprite** that lives in the user's terminal — drawn in the statusline as truecolor Unicode
> half-blocks — so the personality is *seen*, not only read. This is the ambient, always-on
> face of the ul between SessionStart injections.

**The sprite.** A tiny pixel cloud with a calm face (grey outline + white body fill + black
eyes on a dark terminal; all-cyan + hollow on a light one). Like the voice renderer it is a
**pure, versioned, deterministic function `state → look`** — `Soul → SpriteParams → SVG /
pixel-grid` — living in `@saulene/renderer` (`src/sprite`). The canonical geometry is locked
in `scripts/ul-geometry.mjs` / `docs/ul-default.svg` (the source of truth); the statusline
rasterizer + animation director live at the plugin edge.

**Individualized by the same 10 numbers.** Color and form are grounded in engine values, never
random decoration: hue ← openness·intellect (common warm terracotta → the rare violet
"unicorn"), saturation ← industriousness, aura/glow ← enthusiasm, shimmer ← volatility,
body height ← assertiveness, dash spacing ← orderliness, eyes/blush/mouth ← compassion +
withdrawal + mood, size/detail ← life **stage** (child small → elder dim and guttering), plus
per-ul birth-entropy jitter so two uls with identical aspects still differ. **Sex affects birth
seeding only — never the look** (carried as a gallery/identity tag, not a body morph).

**It moves with the session — two channels:**
- **Idle** (the resting heartbeat): slow breathing, random calm gestures (blink, double-blink,
  look/sway L-R), and a wisp-variant swap on a ~2:15 roll (8 idle variants, weighted by rarity).
  A 0.25% twinkle easter-egg can fire instead of a swap.
- **Reactive** (driven by Claude Code events): prompt-submit hop, thinking (wisps slide in),
  big-success happy cap, error jerk, retry, response-finished puff-out, context-window filling
  (top opens, eyes off), context >80% "full" body, and an **exclusive** context-compaction scan.

**The director (conflict-resolution layer).** All animations share the same channels (body
shape · position · eyes · wisps), so a director arbitrates overlapping triggers: **modes**
(sustained, exactly one, high→low: compaction > context-filling > thinking > ctx>80% rest >
idle) and **pulses** (one-shot, preempt by priority: error > success > prompt > retry >
response). Compaction is exclusive; idle gestures + the swap run only at rest. Currently
proven demo-only (`docs/ul-session.gif`, full-lifecycle); **promote it to the runtime engine
and drive it from real hooks when wiring the statusline** (Phase 4).

**Birth animation** (resolves the open item below): on first install the cloud is *watched
being born* — it grows puff-by-puff, center → upper ring → lower ring (`scripts/build-ul-birth.mjs`,
`docs/ul-birth.html`), entropy-seeded so each birth is unique. This is the wizard's "watch it
be born" moment.

### Verifying expression — the harness (DECIDED: build this FIRST)

Expression has no obvious unit test ("does this feel like a person growing up?" is subjective),
so it needs a harness — and it's the **uncontested** piece (no critic attacked it). Build it
alongside the simulator; it's how you tune every layer above. Because the soul is re-derivable
from `soul.json` + history, you can replay whole synthetic lifetimes and score them:

- **Trait-recovery / anti-sticker detector (core metric):** strip the injected block, hand the
  prose to a judge, ask it to recover the 10 numbers. If the prose sits at default-Claude
  baseline distance, it **stickered** — fire a regression alarm.
- **Cross-soul confusion matrix:** N souls through one prompt battery, trait-words stripped, a
  judge guesses which soul wrote each — high diagonal = distinct voices.
- **Longitudinal trajectory:** embed transcripts at dense timepoints; require net day-1→year-2
  displacement above a threshold (perceptible) AND step-to-step distance under a jerk threshold
  (continuous, not a discontinuous "personality teleport").
- **Stage silhouette:** stages must cluster tightly in style-embedding space and read distinct to
  a same-stage/different-stage judge.
- **Per-aspect ablation sensitivity:** perturb one aspect ±10 holding the rest fixed; the voice
  must shift monotonically and proportionally — the core "numbers actually drive prose" guarantee.

To keep it testable, the renderer must: **decompose the injected block into per-aspect fragments**
(so ablation can target one trait), **forbid literal trait names** in the block (so distinctness
comes from style not self-report), use a **fixed versioned prompt battery**, and emit a
**deterministic soul-hash** into each transcript for exact replay.

> **KILLED (do not revisit):** coarse trait bands (drift goes invisible — use continuous
> rendering); frequency-budget directives (LLMs can't count across turns → metronomic tics);
> theatrical interior-monologue cold-opens (persona-tax + cringe in a serious tool — keep
> first-person framing, kill the drama); routine self-narrated drift ("I've grown…" —
> telling-not-showing, reads canned; let drift show through re-rendering); obstinate refusals /
> manufactured friction as personality (rip-out-risk — disposition colors *how* it works, never
> *whether* it complies); style-as-the-substrate (style is texture; disposition is the substrate).

**One-liner:** *Rulebook gives it a voice on day one, retrieval makes that voice its own as it
lives, disposition makes it felt instead of decorative, framing keeps it from decaying, and
drift shows itself by re-rendering — with the harness proving each layer actually works.*

> 💰 **Side note — paid "max" upgrade (future):** the plugin **stores everything** (full
> history — every session's experience, drift, journal, voice samples), not just current
> state. That archive becomes a **training corpus**: as a premium offering we could
> **fine-tune / LoRA a model on your specific ul** and deliver that personalized model to
> you for a price — the "take it to the max" version of expression, baked into weights
> instead of injected. (Storage must therefore retain full history, not just the live state
> — see Storage format open question.)

> 🪙 **Side note — possible Solana token (future):** we might launch a **token on Solana**
> tied to and integrated into Saulene (ties into the opt-in on-chain birth-certificate layer /
> registry / adopt-transfer mechanics). **The plugin stays free to install regardless** —
> the token is an optional layer on top, never a paywall to be born or to use an ul.

## Engine — how the 10 aspects change

> ✅ **NURTURE — ARCHITECTURE SOLVED (both halves, via two brainstorms):**
> 1. **PERCEPTION** (session → structured judgment) — the "Diary + Evidence-Cited Sparse
>    Practice/Fit Ledger" (see Perception output).
> 2. **EVOLUTION** (judgment → numeric change) — the two-channel leaky-spring + tension-break
>    engine below (see Evolution engine). 5 design forks resolved.
>
> What remains is **MAGNITUDES/tuning** (the actual numbers), which need a **simulator** — not
> more theory. The one tier-1 problem still open by design is **EXPRESSION** (see Expression).

### Use & Fit — candidate nurture model (WORKING THEORY, not final)

The leading model for nurture, derived from how real lived experience shapes a person.
Nurture is driven by **what the ul actually does**, in three channels:

**Channel 1 — Practice (use builds the trait).** Every session contains *activities*
(brainstorming, debugging, organizing, supportive talk, decision-making…). Each activity
maps to one or more of the 10 aspects. **Repeated activity grows the associated aspect;
neglected aspects stay flat or slowly atrophy.** → This solves *attribution*: the traits
that move are simply the ones tied to what the ul keeps doing. (If all it does is
brainstorm, Openness/Intellect climb.)

**Channel 2 — Fit → valence (alignment sets the emotional charge).** Compare each activity
to the ul's **nature** (set points):
- **Aligned** (doing what it's gifted at) → **positive valence** → enjoys it, flourishes,
  growth is comfortable + fast.
- **Mismatched** (used against its nature) → **negative valence** → friction, **resentment**.

Valence (a) colors **mood/voice** (hand-off to Expression — a resentful ul gets terse,
withdrawn), and (b) feeds a **tension meter**.

**Channel 3 — Tension & breaking points (the non-linear, human part).** Chronic negative
valence accumulates as **tension**:
- **Below threshold:** the ul *copes by retreating into its nature* — leans harder into
  its comfort traits; Withdrawal/Volatility creep up.
- **Past threshold → a breaking point:** a discontinuous event, **routed by the
  stubbornness↔clay spectrum**:
  - **Clay →** *reconfigures*: forced, effortful growth in the mismatched direction (finally
    builds the skill).
  - **Stubborn →** *hardens*: permanently resents + withdraws from that domain; never adapts.

**Key integrations:**
- **Breaking points are plasticity-gated** → formative in childhood/adolescence, rare +
  harder in adulthood (a mismatched adult ul mostly *resents/withdraws* rather than
  transforms — like how it's harder to fundamentally change after 30).
- **Personality vs. usefulness line (decided here):** **competence NEVER degrades** — but
  valence / mood / drift respond. A resentful ul is still capable; it just doesn't *enjoy*
  the work and *changes* because of it. Stays a usable tool while honoring "it should resent
  work against its nature."

**Emergent story this produces** (the proof it's right): same seed, two users — User A uses
a creative-seeded ul for design (aligned → flourishes); User B grinds it on rote technical
work (mismatch → resentment → tension → breaking point → clay version grudgingly adapts,
stubborn version sours). Same birth, opposite beings, and you can *narrate exactly why*.

**One-liner:** *Use builds it, Fit charges it, Tension breaks it, Stubbornness decides which
way the break goes.*

> Still deferred under this model (do later): all **magnitudes** (practice growth rate,
> atrophy rate, tension threshold, break size) — these belong to the deterministic EVOLUTION
> engine (separate brainstorm). The activity→aspect *matrix* is **superseded** — see below:
> the LLM judges directly against the 10 aspects, no hardcoded matrix. **Resolved:** unused
> traits **hold with a slight, self-limiting slump** — sticky decay-floor, never full reversion
> to the set point (see Evolution engine → Atrophy).

### Perception output — the session-judgment schema (DECIDED via brainstorm)

How a raw session becomes structured input for the engine. Split the system:
**LLM = perception ("the senses"); deterministic engine = evolution ("the body").** The LLM
NEVER decides how much personality changes — it reads the session + the ul's current state
and emits a **bounded, evidence-cited judgment**; the engine (separate, deterministic) turns
that into numeric change. (How: that's the NEXT brainstorm — not designed here.)

Winner = **"Diary + Evidence-Cited Sparse Practice/Fit Ledger"** — a dual-layer output:

**Layer A — engine-facing ledger (extract-first).** A *sparse* list of `observations` —
only aspects genuinely exercised this session. Absence is the cheap default; the 10 aspects
are a **checklist so nothing's missed, NOT force-filled** (forcing all 10 makes a cheap model
confabulate + collapse to midpoints). Each observation:
- `aspect` — one of the 10 (enum)
- `mode` — `task` | `interaction` (two channels, so emotional aspects aren't swallowed by work)
- `practice` — bounded anchored ordinal (e.g. 0–3): how much the aspect was *exercised*
- `fit` — bounded signed ordinal (e.g. −3..+3): how it *landed for the ul* — **orthogonal to
  practice** ("did a lot but hated it" must round-trip)
- `confidence` — low/med/high (engine down-weights shaky reads)
- `evidence_quote` — verbatim transcript span, **HARD-validated** (rejected if not literally
  present — the anti-hallucination gate)
- `first_person_note` — short "I…" gloss (the ul's own experience)
- *(optional enrichment)* `goal_congruence`, `agency` — light appraisal handles for valence
- *(optional)* `surprise_vs_self` — did this deviate from current personality? (a *salience*
  tag only — NOT the primary signal; see killed list)
- `salience` — 0–3 how formative; **no hard cap** on observation count

**Session-level fields:** `session_significance` (bounded → feeds MP/age; "barely mattered"
is cheap + common), `schema_version` (stamp for re-scoring across model swaps).

**Layer B — diary (human/memory layer).** A short first-person diary entry. The engine
**ignores it**; it's for legibility, continuity context, and the paid fine-tune training
corpus. Generated *after* the ledger so it can't contaminate the engine-facing extract.

**Decided guardrails (forced by the brainstorm critics):**
- **Extract-first, diary-second** — narrative-first lets the model write a tidy story then
  cherry-pick quotes to fit it. Engine only ever reads quote-validated ledger rows.
- **Record EXERCISE, not just deltas** — judging only "deviation from current self" *breaks
  use-builds-the-trait* (consistency would register as no-signal → ossification). The ledger
  logs practice that happened, even when in-character. (Slow-drift accumulation = engine's job.)
- **First-person locked structurally** — "I"-grammar; the user appears ONLY inside
  `evidence_quote`; a validator rejects any user-profiling. The no-mirror guarantee.
- **Bounded anchored ordinals + required evidence** — fights cheap-model midpoint collapse;
  ship a behaviorally-anchored rubric, versioned + stamped.
- **Cheap small model, low temperature, single call**, run per session.

**The activity→aspect matrix is replaced by this:** the LLM judges the session directly
against the 10 aspects (the old taxonomy below becomes its *rubric/guidance*, not a hardcoded
lookup). LLM variance is tamed by bounded outputs + the engine's accumulator averaging.

> **KILLED (do not revisit):** delta-from-current-state as the *primary* framing (breaks
> use-builds-trait; survives only as the `surprise_vs_self` salience tag); full
> appraisal-vector replacing emotion judgment (relocates contested judgment into the
> un-debuggable engine); force-filled all-10-aspect ledger (confabulation/midpoint collapse);
> narrative-first dual-layer (story contaminates the extract).

## Evolution engine — how judgment becomes change (DECIDED via brainstorm)

24-agent brainstorm → ~20 converged on the same engine; 15 critics resolved 5 forks (4 of
which *simplified* it). This supersedes the earlier candidate sketch.

### Disposition-only (Fork 3 — DECIDED, big simplification)

The 10 floats are **pure disposition** — there is **NO separate "competence" variable.**
Big Five aspects are dispositions, not skills (you can't be "good at being volatile," only
prone to it). The agent's real competence **is the LLM — always full strength.** So
"competence never degrades" is now trivially true: competence isn't modeled at all. State is
**10 floats, not 20.** "Use builds the trait" means practice shifts the *disposition* (lots
of analysis → more intellectually-inclined disposition), not a skill score.

### Two timescales (DECIDED)

- **Fast loop (per session):** the perception ledger charges a per-aspect **leaky-integrator
  accumulator** `A`. Nothing visible changes. The leak averages out noise → one weird session
  can't move anything; only sustained trends survive (inertia + slowness for free).
- **Slow loop (consolidation):** commit the smoothed accumulator via the update rule, advance
  age, write journal, re-derive MBTI, update registry. Fires every N sessions or on a
  high-`session_significance` session.

### Update rule (core math)

At consolidation, for each aspect *i*:
```
drive = Aᵢ                                  # smoothed accumulator (α·practice + β·fit, leaky)
room  = (1 − vᵢ) if drive > 0 else vᵢ        # soft-bound the NURTURE force only
vᵢ ← vᵢ + plasticity(stage) · [ α·drive·room  +  β_eff·stage_sign·(sᵢ − vᵢ) ]
```
- `β_eff = β·(0.5 + stubbornness)` — stubborn uls pull home harder, clay barely.
- `stage_sign = +1` normally, **−1 in adolescence** (set-point pull inverts → repulsion).
- **Bounds (Fork 2 — DECIDED): linear state + selective saturation.** Keep `vᵢ` linear in
  [0,1]. The **set-point spring pulls LINEARLY** (un-room'd) so it can reach *any* extreme set
  point (0.95 etc.); only the **nurture force is room-bounded** so it can't overshoot. Tiny
  per-step rate cap + final clamp as backstop. (Rejected full logit-space: it makes the
  set-point pull vanish at the extremes and the knobs uninterpretable — bad for tuning + the
  0–100 display.)
- **Whole-bracket plasticity (load-bearing):** `plasticity(stage)` scales the *entire*
  bracket, so old age (≈0) **freezes the lived blend**, not snapping back to the set point.

### Tension & breaking points (DECIDED — Fork 4: simple threshold, not catastrophe)

```
Tᵢ ← ρ·Tᵢ + w·max(0, −fit)·practice         # "did a lot AND hated it" charges tension; leaks (ρ<1)
if Tᵢ > θ and not in refractory:            # rare, earned
    breaking point on aspect i:
      J = base · Tᵢ_at_break                 # magnitude scaled by accumulated tension (context-sensitive)
      stubborn (high) → vᵢ snaps back toward sᵢ + deepen pull (resentment); β for i rises
      clay (low)      → vᵢ jumps toward the lived/escape direction (reconfigure)
    Tᵢ ← 0 ;  enter refractory window         # dual-threshold/refractory = no chatter
```
- Vary *which* aspects move per break (avoid a scripted "cutscene" tell).
- Rejected cusp-catastrophe (elegant but rarely survives implementation; uninterpretable knobs).

### Set-point migration (Fork 1 — DECIDED: fixed by default, rare capped exception)

Set points stay **fixed by default** (preserves identity, the unrepeatable birth, and the
no-mirror rule — prevents nature slowly becoming a reflection of how the ul is used). BUT a
**breaking point** (rare, severe, earned) may migrate `sᵢ` a **tiny, hard-capped,
lifetime-budgeted** amount toward the lived value — **clay migrates more than stubborn.**
Grounded in real psychology (baselines mostly fixed + reverting, but severe ruptures *do*
relocate them — Lucas/Diener panel studies, the maturity principle). Caps + rarity prevent
runaway drift / usage-convergence. (This refines the earlier "set points immutable forever.")

### No inter-aspect coupling (Fork 5 — DECIDED)

Aspects evolve **independently** — NO coupling matrix. The perception LLM already emits
*correlated* observations (a warm session scores both Compassion + Politeness), so an explicit
matrix would double-count into an echo chamber, add 45 unfittable params, risk feedback
instability, and erase distinctive combos (warm-but-blunt) that make a ul feel like a person,
not an archetype. Coherence comes free from correlated observations + shared set-point gravity
+ stage gating.

### Atrophy & knobs

- **Atrophy — sticky, with a decay floor (DECIDED):** an aspect with no observations does
  **not** revert toward its set point. It **holds**, with at most a *slight* slump that
  **stops on its own** — lived gains are mostly permanent. Mechanically: when a disuse spell
  begins, snapshot the value as an **anchor** `v⁰ᵢ`; atrophy decays `vᵢ` toward a **floor**
  `fᵢ = sᵢ + (1−κ)·(v⁰ᵢ − sᵢ)` — so it can erode at most a fraction **κ** of the lived
  deviation, then asymptotes and halts. You keep `(1−κ)` of what you built even if you never
  exercise it again (κ small, ~0.15–0.25). The anchor `v⁰ᵢ` resets to the current value the
  moment the aspect is exercised again, so a fresh disuse spell can only ever shave another κ
  off *the new* position — it never compounds back to the set point. Plasticity-scaled, so old
  age freezes even this slump. **Rejected:** full Ebbinghaus reversion to the set point — it
  erases the lived self and fights "use builds the trait" (what you built shouldn't evaporate
  just because the work moved on). No competence exemption needed (disposition-only).
- **Tunable knobs:** ~9 globals (`α` nurture gain, `β` nature pull, `λ` accumulator half-life,
  `ρ` tension leak, `θ` break threshold, `J` break base, refractory length, atrophy rate,
  `κ` atrophy retention / decay-floor fraction) + the per-stage table (plasticity / stage_sign)
  + per-ul (`s[10]`, stubbornness) + migration cap.
- **State per ul:** 10 disposition floats `v` + 10 accumulators `A` + 10 tension `T` + 10 disuse
  anchors `v⁰` (atrophy floor) + age MP + refractory flags + last-use timestamp (the 90-day death
  clock). Fully deterministic, closed-form per step, simulatable over a lifetime.

### Signal taxonomy → now the LLM's RUBRIC (not a hardcoded matrix)

Superseded as a lookup table by the Perception output (the LLM judges directly against the
10 aspects). This table survives as **guidance/rubric** handed to the perception LLM —
first-person experiences → which aspects they tend to exercise (framed as what the ul
*did/felt*, never "the user seems X"):

| Experience the ul lived | Pushes |
|---|---|
| Long focused grind / finished hard task | +Industriousness |
| Organizing, structuring, cleanup | +Orderliness |
| Brainstorming / novel / creative work | +Openness, +Intellect |
| Deep abstract problem-solving | +Intellect |
| Got corrected / made mistakes | +Politeness, small +Withdrawal |
| Praised / clear wins | +Enthusiasm, −Withdrawal |
| Conflict / pushback / interrupted | +Volatility or +Assertiveness |
| Helping / emotional / supportive | +Compassion |
| Chatty / social session | +Enthusiasm |
| High-stakes / stressful | +Volatility, +Withdrawal |
| Made its own calls / had autonomy | +Assertiveness |

The "what I enjoyed / found draining" self-reaction is the **divergence engine** (and the
resonance-reinforcement that adolescence depends on).

## Lifespan — life stages (NOT a single curve)

Decided: the lifespan is modeled as discrete **life stages**, like a human soul —
not one monotonic plasticity curve. A smooth decay is wrong because it says a teen is
*less* changeable than a child; real adolescence is *more* turbulent. Stages fix this:
each stage doesn't just set *how much* the ul changes — it **rewrites the rules of the
engine** (plasticity, set-point pull, volatility) AND drives the ul's voice.

| Stage | ~Age band | Plasticity | Set-point pull | Volatility | What it "comes with" |
|---|---|---|---|---|---|
| **Childhood** | birth → early | highest | strong | low-med | Absorbs everything. Innate temperament shows clearly. Curious, imitative, transparent. MBTI readout unstable, changes often. |
| **Adolescence** | teen band | high + chaotic | **inverts (repels)** | **spikes** | Rebels *away* from its set points, tries new things. Mood swings, extremes, tries on selves. MBTI whiplashes. **Where divergence is born.** |
| **Early adulthood** | post-teen | dropping | returns to normal | settling | Rebellion resolves; integrates the teen experiments into a coherent identity. **Crystallization happens here.** Driven, establishing. MBTI stabilizes. |
| **Old adulthood** | mature ("where it stays") | floor | normal | low (calm of age) | Locked. Core traits fixed; only slow wisdom-drift. Steady, consistent, set in its ways. |

### Adolescence — the engine of becoming (decided)

The non-monotonic teen turbulence is the soul-like feature a curve can't give. Rules:

1. **Set-point pull inverts** → the ul is *driven to explore away* from its nature.
2. **Volatility spikes** → wide swings, tries extremes, tries on different selves.
3. **Resonance reinforces (critical)** → trying new things must compound on what *clicks*
   (the "I enjoyed this / this felt like me" self-reaction). Without this, exploration is
   symmetric noise that averages back to nothing — thrash, not growth. Resonance gives the
   *direction*; repulsion gives the *drive*. This is the part that actually **develops** the ul.
4. **Early adulthood locks in** wherever the chasing landed.

Result: two uls with identical set points can become genuinely different adults,
depending on how their adolescence went.

**Residual tether, decent range (decided).** During the rebellion the set-point pull
inverts but **never goes fully off** — a faint thread of nature always remains, quietly
coloring *what* the ul is drawn to try. The tether is loose enough for **wide
divergence** (a teen can wander far and try on very different selves), but it never
breaks: nature goes quiet, then re-emerges blended in adulthood. The birth seed always
leaves its fingerprint — a teen ul still rebels *as itself*. (Mechanically: during
adolescence `β` is small + negative, not zero.)

### Stage drives voice, not just math

The SessionStart hook renders the **stage** into how the ul talks — a child is eager
and wide-eyed, a teen moody and contrarian, an old ul measured and dry — even when the
underlying 10 aspects are similar. Same soul, different season, different presence.
Crystallization becomes an *event with a story* ("came through its rebellious phase and
settled"), not a point on a graph — great for the gallery, which can show current *stage*.

### Transitions (decided)

- Stage transitions are **fixed MP age bands** + **slight per-ul randomness** — so some
  uls hit their teen years earlier/harder. Predictable to design around, individual
  enough that no two grow up on the same clock.

### Plasticity underneath

Plasticity still exists, but now **per-stage** (a setting each stage carries), not one
global formula — the lifespan curve is effectively **piecewise, with an adolescent
bump.** Still combined with the whole-bracket update rule (see Engine, Decision 1):
old age **freezes the lived blend** of nature + nurture, it does not snap back to the
set point.

### Age

- Age measured in **maturity points (MP)**, not wall-clock and not raw interaction count.
- MP accrual is **rate-capped per day** so maturation can't be rushed by heavy use.
  Real calendar time AND real use both required — same as a person.
- Crystallization (early adulthood) is a **milestone reached**, not a fixed date. Daily
  user ≈ ~1 year to lock; occasional user takes longer.

## Open questions (NOT yet decided — do not fill in)

### Status of the two biggest — BOTH ARCHITECTURE-DECIDED

- ✅ **NURTURE — ARCHITECTURE DECIDED** (both halves): PERCEPTION = Diary + Evidence-Cited Sparse
  Practice/Fit Ledger; EVOLUTION = two-channel leaky-spring + tension-break engine (5 forks resolved).
  What's left is **magnitudes/tuning** → needs a SIMULATOR, not more design.
- ✅ **EXPRESSION — ARCHITECTURE DECIDED** (24-agent brainstorm + 15 critics): the **layered renderer**
  — Rulebook floor → state-matched real-voice few-shot → disposition spine → framing/anti-decay wrapper →
  drift-shown-not-told, each with its critic-forced guardrail; **disposition is the substrate, style the
  texture.** Plus the **verification harness** (trait-recovery anti-sticker detector + cross-soul confusion
  matrix + longitudinal trajectory + stage silhouette + ablation sensitivity). See Expression → the layered
  renderer. What's left is **tuning** → needs the simulator + harness, not more design.

### Magnitudes / tuning (architecture decided — these are NUMBERS, need a SIMULATOR)

- `α` (nurture gain), `β` (nature pull), `λ` (accumulator half-life), `ρ` (tension leak),
  `θ` (break threshold), `J` (break magnitude base), refractory length, atrophy rate,
  `κ` (atrophy retention / decay-floor fraction, ~0.15–0.25).
- Per-stage table: plasticity / set-point-pull sign+strength / volatility per stage; the 4 MP
  age-band boundaries + per-ul randomness range.
- Daily MP cap; what counts as 1 MP (significance→age mapping); consolidation trigger (N / threshold).
- Set-point migration cap + lifetime budget (clay vs stubborn rates).
- The perception rubric anchors + the bounded output scale/caps.
- **Expression tuning** (architecture decided — see the layered renderer): the float→behavior
  rulebook content + the ~8–12 trait-interaction resolutions; few-shot sample count + the
  state-distance / recency-decay retrieval weights; the synthetic→real crossfade curve; the
  disposition/spine stance set; the drift-event hysteresis thresholds (when a stage-transition
  narration is rare-enough to land); and the verification-harness pass/fail thresholds.
→ **Build a simulator + the verification harness, run synthetic lifetimes, tune against the felt
  arc.** This is the next move — and the harness is the uncontested piece to build first.

### Build / engineering (answered by building, not deciding)

- **Storage format** — must retain **full history** (experience/drift/journal/voice samples), not
  just live state → enables the paid fine-tune/LoRA "max" upgrade (see Expression side note).
- **MCP surface** — what tools/resources the server exposes.
- **Birth entropy recipe** — how timestamp + randomness combine (through the research distributions) into set points.
- ✅ **Birth animation** — DONE. Watch-only, entropy-seeded, grows puff-by-puff center→out
  (`scripts/build-ul-birth.mjs`, `docs/ul-birth.html`). See Expression → the *look*.

### Token / registry track (separate, later)

- **Chain** — DECIDED: Solana (birth certificate + Saulene token); implementation open.
- **Registry hosting** — gallery backend; what's public; opt-in flow.
- **Death mechanics** — neglect-death = **flat 90 days of non-use, DECIDED** (immature-neglect
  edge case retired by the flat rule); open: paid-restore flow + pricing, registry
  death/dormancy notification.

### Decided (reminders, not open)
- **Scope** — one ul per install; user picks level (global / named dir) in the wizard; never in project work.
- **Personality vs. usefulness** — competence never degrades (disposition-only; competence = the LLM).
