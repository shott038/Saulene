# Mission: plugin shows only SAFE data (qualitative-only surfaces)

**Started:** 2026-06-07
**Branch:** claude/plugin-safe-surface
**Parent:** main @ f1b54a1

Full design: **`docs/plugin-safe-surface-plan.md`** (read it first). This is the plugin half of the
paywall foundation: the user-facing surfaces stop revealing the VALUABLE numbers (raw 10 aspects,
stubbornness, dynamics), so the gallery (paid) becomes the only nice place to see them. The DB-side
"vault" is being done in parallel by the operator — don't touch the registry/DB here.

## SAFE vs VALUABLE (local surfaces)
- **SAFE (show):** MBTI, stage, age, sex, the sprite/look, public ID (pubkey), neglect-death
  countdown, alive/dormant/dead status, born date.
- **VALUABLE (hide):** the 10 aspect values, set_points, stubbornness, tension, beta_gain,
  migration_budget, disuse_anchor, and any numeric drift.

## Changes
1. **`packages/plugin/src/mcp/snapshot.ts`** (shared read path) — return SAFE fields only; remove
   `aspects` and any raw numeric soul fields from the snapshot.
2. **MCP tools (`packages/plugin/src/mcp/`)**:
   - `ul_snapshot` → SAFE only.
   - `ul_drift` → currently numeric = VALUABLE. Convert to **qualitative** ("leaning more reserved
     lately", no numbers) or remove it. Recommend qualitative.
   - `ul_countdown` → SAFE, unchanged.
3. **`/ul` skill (`packages/plugin/src/skill/`)** — MBTI / stage / age / sprite / countdown / public
   ID only; NO numeric breakdown. Add an upsell line: "see your full breakdown on the gallery →
   <gallery-url>/ul/<pubkey>" (URL can be a constant/placeholder).
4. **Do NOT change the reporter's existing behavior** — it must keep sending the full fingerprint to
   the (gated) DB; it reads the soul directly, not via this snapshot path. Only the user-facing
   surfaces go qualitative.
5. **Tests** — update mcp/skill tests to assert SAFE-only output (no raw aspect numbers leak through
   ANY tool or the skill). Add an explicit "no valuable numbers in output" assertion.

## Bonus (only if quick, else skip): sprite descriptor for the gallery wall
The public gallery will need to draw each cloud without the raw aspects. If easy, have the reporter
ALSO send a `sprite` descriptor (the lossy visual params from renderer `spriteParams(soul)`) as a new
SAFE fingerprint field. This is additive and safe (lossy, doesn't reveal the raw vector). If it
balloons scope, skip it and leave it for the website-build phase.

## Constraints
- `core`/`renderer`/`storage` stay pure; `pnpm check:boundaries` green.
- Be honest in any comments: the engine still needs the full numbers locally in `soul.json` — this
  hides them from the UI, not from the disk.

## Definition of done
- No plugin surface (`/ul`, any MCP tool) reveals raw aspect numbers / dynamical state — SAFE +
  qualitative only, plus the gallery upsell. Reporter still feeds the gated DB. Tests prove no
  numeric leak. `pnpm check` green.

## Status
Status: ready-to-merge
