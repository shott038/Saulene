# Plan: lock the database — the "vault" (SAFE public vs VALUABLE gated)

**Status:** planned. The registry DB is currently **public-read on everything** (anon can read every
column). With reporting now default-on, the valuable soul numbers would sit in a publicly-queryable
table. This plan splits the data so the public sees only SAFE fields and the VALUABLE fields are
readable **only by the owner after payment**. Do this BEFORE the plugin ships / gets real users.
(DB is empty now — 0 rows — so we can restructure freely.)

## The SAFE / VALUABLE line
**SAFE — free, public gallery (anon-readable):**
- `pubkey` (public ID), `mbti`, `stage`, `mp` (age), `sex`, `status`, `born_at`, `first_seen`,
  `last_seen`, `soul_hash` (fingerprint badge — a hash, not the values), `display_name`, a
  `claimed` boolean, `plugin_version`.
- **Sprite descriptor** (`sprite` jsonb) — the lossy visual params (hue/body/size) needed to draw the
  cloud on the gallery wall. NOTE: the sprite is *derived* from the aspects, so it leaks coarse
  signal (like the voice does). That's acceptable — it's lossy and the cloud wall is the whole
  appeal. We expose the *render descriptor*, never the raw aspects.

**VALUABLE — gated, owner-after-payment only (anon-DENIED):**
- the exact 10 `aspects`, `set_points`, `stubbornness`, `tension`, `beta_gain`, `migration_budget`,
  `disuse_anchor`, `seed`, and the per-snapshot aspect/tension time-series.

## Schema changes
1. **Split `uls`:** keep SAFE columns on `uls` (public-read policy). Move VALUABLE columns into a
   new table **`ul_secrets`** (`pubkey` PK/FK → `uls`), with **NO anon/authenticated policy** (only
   `service_role` can touch it). Add a `sprite` jsonb SAFE column to `uls`.
2. **Split `snapshots`:** keep `mp`/`stage`/`mbti`/`at` on a public-readable `snapshots` (for free
   age/stage/type timelines); move `aspects`/`tension` into **`snapshot_secrets`** (anon-denied).
3. **`events` stays public** (the life-story timeline is part of the free draw) — BUT enforce that
   event payloads contain **no raw numeric soul values** (names/labels only, e.g. `{aspect:"openness"}`
   for a rupture, never `{from:0.4,to:0.9}`). Audit the reporter's event meta accordingly.
4. **New `unlocks` table** — `pubkey` (PK/FK), `paid_at`, `provider`, `ref` — the payment record that
   gates VALUABLE reads. Anon-denied.

## RLS / access model
- **Public (anon):** SELECT only on the SAFE surfaces (`uls` safe columns or a `uls_public` view,
  `snapshots`, `events`). REVOKE/deny everything on `ul_secrets`, `snapshot_secrets`, `unlocks`.
- **Writes:** unchanged — only the ingest Edge Function (service_role) writes, after ed25519 verify.
- **Owner reads of VALUABLE data** go through a NEW gated endpoint, never direct anon SQL:
  - **Edge Function `ul-private`** — caller proves ownership by **signing a challenge with the ul's
    private key** (reuse the existing ed25519 verify); the function checks `unlocks` for that pubkey;
    if paid → returns the `ul_secrets` + `snapshot_secrets` rows via service_role. Else 402/403.
  - This is the only path to the numbers. RLS makes anon-direct impossible; the function enforces
    ownership + payment.

## Payment (later, sketch)
- Stripe (or the Solana token) → on success, insert into `unlocks(pubkey, paid_at, ...)`.
- The same ed25519 key that signs reports also proves ownership for unlock — no separate accounts.

## Honesty follow-up (do with this)
The README/SPEC currently list "aspects" as shared-to-gallery. After this split, aspects are
*reported but private to you* (unlock to view), not publicly visible — update that wording so the
public-vs-owner distinction is accurate.

## Migration steps (all via Supabase MCP; DB empty so low-risk)
1. `alter table uls add column sprite jsonb;`
2. create `ul_secrets`, `snapshot_secrets`, `unlocks`; move the VALUABLE columns there; drop them
   from `uls`/`snapshots`.
3. RLS: public-read SAFE surfaces; deny anon on the secret/unlock tables.
4. Update the ingest Edge Function to write SAFE → `uls`/`snapshots`, VALUABLE → the secret tables,
   and a `sprite` descriptor → `uls.sprite`.
5. Build the `ul-private` gated read function (ownership challenge + paid check). [or defer to website]
6. Verify end-to-end: anon can read SAFE, anon CANNOT read secrets; a signed+paid owner can.

## Open decisions
- View vs column-level: split-tables (above) is simplest + safest; Postgres column RLS is fiddly.
- Payment provider (Stripe vs token) — separate decision.
- Whether the sprite descriptor leak is acceptable (recommend yes — lossy, and it's the gallery's point).
