# Mission: enrich the reporter's fingerprint — send the full PUBLIC soul state

**Started:** 2026-06-07
**Branch:** claude/reporter-rich-fingerprint
**Parent:** main @ e7bb31a

## Goal
The registry DB + ingest function were just expanded to a rich v2 schema (full public soul math +
a `snapshots` time-series + provenance). The server already ACCEPTS these fields (tolerant — writes
null when absent). This brick makes the **reporter actually SEND them**, so we capture everything
public for the future website. Still opt-in, still public-only, still signed + fire-and-forget.

## Add these fields to `PublicFingerprint` + `buildFingerprint` (`packages/plugin/src/reporter/reporter.ts`)
Field names are the WIRE CONTRACT — they must match exactly (snake_case); the server maps
`fingerprint.<name>` → the DB column of the same name. Source everything from the loaded `soul`
(+ cheap pure derivations). **All public soul math — never private content.**

| field | source | scale/notes |
|---|---|---|
| `set_points` | `soul.s` | per-aspect, ×100 rounded (same scale as `aspects`) — the birth baseline |
| `disuse_anchor` | `soul.disuseAnchor` | per-aspect, ×100 rounded |
| `stubbornness` | `soul.stubbornness` | raw 0–1 |
| `tension` | `soul.tension` | per-aspect, RAW (dynamical magnitude, not 0–1) |
| `beta_gain` | `soul.betaGain` | per-aspect, RAW |
| `migration_budget` | `soul.migrationBudget` | raw number |
| `soul_hash` | the renderer's FNV hash of `v` (`render(soul).soulHash`, or a smaller exported hash if one exists) | string |
| `plugin_version` | the plugin `package.json` version | string (currently "0.0.0") |
| `schema_version` | a reporter schema-version constant (or reuse storage's `STORAGE_SCHEMA_VERSION`) | number |

Keep all existing fields (`pubkey`, `mbti`, `aspects`, `stage`, `mp`, `sex`, `status`, `born_at`).
The signature already covers the whole `{fingerprint, timestamp}`, so no signing change is needed —
just include the new keys before signing.

## Out of scope (DB columns exist + are nullable — fill in later bricks)
- `seed` — the birth entropy is NOT currently persisted in `soul.json`; persisting it is a separate
  change. Do NOT fabricate one. Leave it unsent.
- `host_model` — needs the Claude Code hook payload's model; separate plumbing. Leave unsent.
- `display_name` — needs a user-naming feature. Leave unsent.

## Constraints
- Public fingerprint ONLY — never diary, voice samples, ledger, message content.
- `core`/`renderer`/`storage` stay pure; reporter is plugin-edge IO. Don't import anything that
  breaks `pnpm check:boundaries`. (`render` is fine — renderer is a pure dep of plugin.)
- Opt-in gate (`reporterEnabled`) + the default URL wiring are already in place — don't change them.

## Definition of done
- The heartbeat + event payloads include the new public soul fields, sourced from the soul,
  correctly scaled. Reporter tests updated to assert their presence + shape (injected transport, no
  real IO). `pnpm check` green.

## Key files
- `packages/plugin/src/reporter/reporter.ts` — `PublicFingerprint` + `buildFingerprint`
- `packages/plugin/test/reporter.test.ts` — reporter tests (28 tests)

## Verification
- Build: pass
- Tests: pass (347 passed, 28 in reporter.test.ts — up from 19)
- Scope kept: yes — all 9 new fields added, no out-of-scope fields touched, core/renderer/storage untouched, boundaries clean
- Summary: reporter now sends set_points, disuse_anchor, stubbornness, tension, beta_gain, migration_budget, soul_hash, plugin_version, schema_version alongside existing fields

## Status
Status: ready-to-merge
