# Mission: ul identity keypair — every ul gets a key + public ID at birth

**Started:** 2026-06-07
**Branch:** claude/keypair-identity
**Parent:** main @ cdcd144

## Goal
Lay the **identity foundation** for the future registry/website (Phase 5,
`docs/registry-website-plan.md`) — but standalone and useful on its own. Every ul, from the moment
it's born, gets a cryptographic keypair: a **public key that is its permanent public ID**, and a
private key that **never leaves the machine**. This means even before any website/DB exists, every
ul already has a stable, verifiable identity we can later claim/verify against — no migration needed.

**Scope is JUST the local keypair + identity.** No network, no reporter, no DB, no website — those
are later, separate bricks. This brick makes keys exist and surfaces the ID.

## Requirements
1. **ed25519 keypair** (use `node:crypto`). ed25519 is deliberate — it's Solana's curve, so this same
   key becomes the Solana wallet for the eventual token with zero rework.
2. **Generated at setup/birth**, at the plugin edge (IO lives here; `core` stays pure — do NOT put
   keys in the pure engine). Hook into the existing wizard (`packages/plugin/src/setup/wizard.ts` /
   `runWizard`) so a newborn ul gets its keypair as part of birth.
3. **Stored separately from the soul:** `~/.saulene/key.json` (NOT in `soul.json` — the soul must
   stay purely replayable from its seed; keys are identity, not personality). Store the private key
   with restrictive file perms (0600). Follow the storage edge patterns (injected `root`, atomic
   write, fail-loud load) — but note keys are identity/plugin-edge, so a small `plugin`-side module
   (e.g. `packages/plugin/src/identity/`) is the natural home rather than `storage`. Pick the
   cleanest home that keeps `pnpm check:boundaries` green.
4. **Idempotent:** generating twice must NOT overwrite an existing key (a ul's identity is permanent).
   Load-or-create semantics.
5. **The public ID:** derive a clean, shareable public ID from the pubkey (e.g. base58/base64url of
   the raw ed25519 public key — base58 to stay Solana-flavored). This is what a URL like
   `saulene.xyz/ul/<id>` would use.
6. **Surface it:** show the public ID via the `/ul` skill snapshot (`packages/plugin/src/mcp` /
   `skill`) so a user can see their ul's ID. Read-only.
7. **A `sign(message)` / `verify` primitive** exported for the future reporter + `/ul claim` (sign a
   challenge with the private key). Build the primitive now (it's tiny and needed next); do NOT build
   the network reporter or claim flow yet.

## Out of scope (explicitly)
- The registry API, the Supabase DB, the website, the heartbeat/reporter, the `/ul claim` *flow*
  (the signing primitive is in scope; the website handshake is not), the Solana token.
- `core`/`renderer`/`storage` purity — do not violate. Keys are plugin-edge IO.

## Definition of done
- New uls get an ed25519 keypair at birth in `~/.saulene/key.json` (0600), idempotent.
- A clean public ID is derivable + shown via `/ul`. `sign`/`verify` primitives exist + tested
  (dep-injected, no real IO in tests).
- `pnpm check` green (boundaries + lint + typecheck + tests).

## Key files
- `packages/plugin/src/identity/keypair.ts` — all crypto: base58, load/create, sign, verify
- `packages/plugin/src/identity/index.ts` — re-exports
- `packages/plugin/src/setup/wizard.ts` — `loadOrCreateKeypair(root)` hooked after `saveSoul`
- `packages/plugin/src/mcp/snapshot.ts` — `publicId: string | null` added to `UlSnapshot`
- `packages/plugin/src/skill/index.ts` — `id: <base58>` surfaced in `/ul` output
- `packages/plugin/test/identity.test.ts` — 14 tests (base58, load/create, idempotency, perms, sign/verify)

## Verification
- Build: pass
- Tests: pass (319 passed — 14 new identity tests)
- Scope kept: yes — no network, reporter, DB, or claim flow; core/renderer/storage untouched
- Summary: ed25519 keypair at birth in key.json (0600), base58 public ID in /ul, sign/verify exported

## Status
Status: ready-to-merge
