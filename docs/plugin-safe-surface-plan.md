# Plan: plugin shows only SAFE data (qualitative-only surfaces)

**Status:** planned. Pairs with `docs/db-vault-plan.md`. Goal: the plugin's user-facing surfaces
(`/ul` skill + MCP tools) stop revealing the VALUABLE numbers, so the raw 10 aspects / stubbornness /
dynamics aren't given away in-product — the gallery (paid) becomes the only nice place to see them.

## The hard limit (state it plainly, don't pretend otherwise)
The engine NEEDS the full numbers locally to run, so `~/.saulene/soul.json` still contains them in
plaintext. A technical owner can open that file — we accept that (99% won't). This plan removes the
numbers from the *product UI*, not from the disk. (Optional bar-raiser below.)

## SAFE vs VALUABLE on the LOCAL surfaces (mirror the DB split)
- **SAFE (show):** MBTI, stage, age, sex, the **sprite/look**, public ID (pubkey), neglect-death
  countdown, alive/dormant/dead status, born date.
- **VALUABLE (hide):** the 10 aspect values, set_points, stubbornness, tension, beta_gain,
  migration_budget, disuse_anchor, and any numeric drift.

## Changes
1. **`packages/plugin/src/mcp/snapshot.ts`** (the shared read path behind all surfaces) — return only
   SAFE fields. Remove `aspects` and any raw numeric soul fields from the snapshot it produces.
2. **MCP tools (`packages/plugin/src/mcp/`)**:
   - `ul_snapshot` → SAFE only (MBTI/stage/age/sex/sprite/id/status/countdown).
   - `ul_drift` → currently exposes numeric drift = VALUABLE. Either remove it, or convert to
     **qualitative** drift ("leaning more reserved lately") with NO numbers. Recommend qualitative.
   - `ul_countdown` → SAFE, unchanged.
3. **`/ul` skill (`packages/plugin/src/skill/`)** — output MBTI / stage / age / sprite / countdown /
   public ID only. No numeric breakdown. Add a line: "see your full breakdown on the gallery →
   <url>/ul/<pubkey>" (the upsell).
4. **Do NOT change the reporter.** It still sends the full fingerprint to the (gated) DB — it reads
   the soul directly, not via this snapshot path. Only the *user-facing* surfaces go qualitative.
5. **Tests** — update mcp/skill tests to assert SAFE-only output (no raw aspects leak through any
   tool/skill).

## Optional bar-raiser (separate, low priority)
Lightly obfuscate `soul.json` at rest (e.g. store the soul base64'd / under a non-obvious key) so a
casual `cat ~/.saulene/soul.json` doesn't reveal the numbers. This stops casual peeking, NOT a
determined user (the open-source plugin must still decode it locally to run). Decide later; not
required for the paywall.

## Definition of done
- No plugin surface (`/ul`, any MCP tool) reveals the raw aspect numbers or the dynamical state;
  only SAFE/qualitative fields + the gallery upsell. Reporter unchanged (still feeds the gated DB).
  Tests prove no numeric leak. `pnpm check` green.

## Sequencing note
Best done AFTER (or alongside) the DB vault split so the "see your full breakdown on the gallery"
upsell points at a real gated endpoint. The two plans together = the paywall foundation.
