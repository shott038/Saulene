# Mission: Birth seeding + MBTI projection (core Bricks 1 & 2) with a 10k-birth rarity test

**Started:** 2026-06-06
**Branch:** claude/core-birth-seeding
**Parent:** main @ 81db950

## Goal
Build the first real engine bricks in `packages/core`: `seedFromEntropy(entropy, now) → Soul`
(research-grounded Gaussian set-point seeding) and a pure, display-only MBTI projection
(`aspects → 16-label`). They ship together because the MBTI readout is how we *score* the
seeding. The acceptance gate is a deterministic 10k-birth population test whose projected-MBTI
frequencies match SPEC's real-world rarity targets. Everything stays PURE — no `Date.now` /
`Math.random` / `new Date`; entropy and clock are injected so births replay deterministically.

## Brick 1 — Birth seeding (`packages/core/src/birth/`)
`seedFromEntropy(entropy: Uint8Array, now: number): Soul`
- Seeded PRNG from `entropy` bytes → Box-Muller → per-aspect Gaussians. Same entropy in → same Soul out.
- Each aspect Gaussian, mean ≈ 0.50, clamped to [0,1].
- Per-aspect σ (SPEC table 2): Compassion .17 · Withdrawal .16 · Politeness .16 · Volatility .15 ·
  Openness .14 · Enthusiasm .14 · Intellect .14 · Orderliness .12 · Assertiveness .11 · Industriousness .11
- gender d: Compassion .45 · Withdrawal .40 · Politeness .36 · Volatility .30 · Openness .27 ·
  Enthusiasm .23 · Intellect .22 · Orderliness .18 · Assertiveness .09 · Industriousness .06
- Sex 50/50 from entropy. Mean shift = ±½·d in σ units → `shift = 0.5 * d * σ_aspect`.
  FEMALE higher on Compassion, Withdrawal, Politeness, Openness, Enthusiasm, Orderliness, Volatility;
  MALE higher on Intellect & Assertiveness. Apply the signed ±½·d consistently with that list.
- Sex affects ONLY seeding — never voice/behavior.
- Init Soul (type in `packages/core/src/state/index.ts`): `v = s` (seeded set points), `a = 0`,
  `tension = 0`, `disuseAnchor = v` at birth, `stubbornness = rand[0,1]` from entropy, `mp = 0`,
  `lastUsedAt = now`.

## Brick 2 — MBTI projection (`packages/core/src/mbti/` or `src/state`)
Pure, display-only `aspects → 16-label` at SPEC percentile thresholds (table 4):
- E/I: E = top ~49.3% from Enthusiasm + Assertiveness
- S/N: N = top 26.7% from Openness + Intellect  ← the big skew
- T/F: F = top ~60% from Compassion (vs Politeness balance)
- J/P: J = top ~54% from Industriousness + Orderliness
Thresholds are population percentiles on the COMBINED seeded distribution — derive the cut from
the seeding model (mean/σ of the relevant aspect-sum), NOT a flat 0.5 on raw aspects, so projected
label frequencies match the target rarities. Document the cut math in a comment.

## Proof (acceptance gate — vitest, deterministic)
10k-birth population test (fixed entropy stream): projected-MBTI frequencies within tolerance of:
- rarest: INFJ ~1.5% · ENTJ ~1.8% · INTJ ~2.1% · ENFJ ~2.5%
- commonest: ISFJ ~13.8% · ESFJ ~12% · ISTJ ~11.6%
- global splits: S/N ≈ 73.3/26.7 · E/I ≈ 49.3/50.7 · T/F ≈ 40.2/59.8 · J/P ≈ 54.1/45.9
Tolerance: ~±1.5pp per-type, tighter on the four global splits. If a raw aspect-sum model can't
hit these, tune the THRESHOLD derivation (not the σ table) until it does.

## Key files (expected)
- `packages/core/src/birth/index.ts` — `seedFromEntropy` + σ/gender-d tables + seeded PRNG/Box-Muller
- `packages/core/src/mbti/index.ts` (or `src/state`) — MBTI projection + threshold derivation
- `packages/core/src/state/index.ts` — Soul type already defined; add constructors if needed
- `packages/core/test/…` — the 10k-birth population test

## Out of scope
- The untracked `docs/ul-*.html` and `scripts/build-ul-*.mjs` / `scripts/ul-*.mjs` files — do NOT touch.
- Bricks 3–5 (stages/aging, consolidation, tension). Stay in `packages/core` only.
- No LLM, no IO, no clock/entropy sources inside core — all injected.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), the 10k test passing, and
`BUILD_GUIDE.md` updated IN THE SAME COMMIT: check off Brick 1 + Brick 2, advance the
"Right now" line to Brick 3 (Stages + aging).

Source of truth: `SPEC.md` §"Born someone" + §"Birth seeding distribution" (lines ~97–178);
`docs/ARCHITECTURE.md` for the boundary contract.

## Status
Status: ready-to-merge
