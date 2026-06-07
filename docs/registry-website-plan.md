# Registry + Website Plan (Phase 5) — the ul gallery

**Status:** planned. Separate track from the shipped plugin — does not disturb it. Claim mechanism
**locked: ed25519 keypair** (Solana-compatible, so it becomes the token wallet later with no rework).

## What we're building
A companion website + registry where each ul (opt-in) is publicly listed, its lifecycle tracked,
and the whole population is shown — alive/dead counts, nursery, graveyard, MBTI spread, oldest
living ul, a wall of the real sprites. Owners can **claim** their ul by proving they hold its key.

## Architecture
```
plugin (opt-in reporter, signs with ul privkey) ──► registry API ──► Postgres ──► website
   ~/.saulene/key.json (private)                    (verifies sig)    (public fp)   (gallery)
   ~/.saulene/soul.json (private, never uploaded)
```
- `core`/`renderer` stay pure. The reporter is a new opt-in module at the **plugin edge** only.
- The website/registry is a **separate repo** (Next.js app), like `sidequestr-site`. The only thing
  that lives in THIS repo is the plugin-side keypair + reporter.

## Identity & claiming — ed25519 keypair
- **At setup (plugin edge), generate an ed25519 keypair**, store in `~/.saulene/key.json`. The
  **public key = the ul's permanent public ID** (and its URL: `saulene.xyz/ul/<pubkey>`). The
  private key NEVER leaves the machine. Kept out of `soul.json` (soul stays pure-replayable).
- **Authenticated reporting (anti-spoof for free):** the plugin signs every heartbeat/event with the
  privkey; the registry verifies against the pubkey. Only the real owner can write to that ul's row.
- **Claiming:** website shows a nonce → user runs `/ul claim` → plugin signs the nonce → paste back
  → verified. Whoever holds the key owns the ul.
- **Token on-ramp:** ed25519 = Solana's curve, so this same key becomes the Solana wallet for the
  Phase-5 birth-certificate/token. No migration.

## Privacy (non-negotiable, matches the reality-warning ethos)
- **Opt-in only.** Default off; the setup wizard asks explicitly.
- **Public fingerprint only — the private soul NEVER leaves the machine.** Upload: pubkey, MBTI,
  age (`mp`), stage, the 10 aspect values (sprite params), alive/dead, birth date, last-seen, and
  lifecycle events. NEVER: diary, voice samples, ledger, or any user message content.

## Data model (sketch)
- `uls`: `pubkey` (PK), `mbti`, `aspects` (jsonb, the 10 values), `stage`, `mp`, `sex`,
  `born_at`, `last_seen`, `status` (alive | dormant | dead), `claimed_by` (nullable).
- `events`: `id`, `pubkey` (FK), `kind` (born | stage_change | rupture | death | heartbeat),
  `payload` (jsonb), `at`.
- Death-sweep: a daily cron flips `status` → dead when `now - last_seen > 90d` (mirrors the local
  neglect-death clock; the site just observes it).

## Reporting
- Plugin sends a small **signed heartbeat** per session + event pings (born / stage_change / rupture
  / death). Heartbeat updates `last_seen` + the current public fingerprint. Keep it tiny + rate-limited.

## Stack (leans on existing tooling)
- **Next.js on Vercel** — website + registry API routes in one repo.
- **Postgres via Supabase** — `uls` + `events`.
- **Vercel Cron** — the daily death-sweep.
- **Sprite on the web:** `renderer`'s sprite is pure JS → render the *exact* terminal cloud-spirit on
  the website from the stored aspect params. Living wall of the real sprites.

## Anti-cheat stance (honest)
Reports are owner-signed (can't spoof someone else's ul) but the *stats* are self-reported — a
determined user could fake their own numbers. For a fun gallery that's acceptable: accept-and-display.
Full anti-cheat (server re-deriving the soul from a signed session log) is possible but heavy and out
of scope for v1. The site is a "fun registry," not a ledger of record.

## Gallery features (once data exists)
Alive/dead counters · nursery (newborns) · graveyard (neglect-dead) · dormant · MBTI distribution ·
oldest living ul · rarest fingerprints · most-ruptured life · animated sprite wall · live "N alive now".

## Build sequence
1. **Plugin side (this repo):** ed25519 keypair at setup (`~/.saulene/key.json`) + `/ul claim`
   command + the opt-in signed reporter module (heartbeat + events). Wizard adds the opt-in prompt.
2. **Registry (new repo):** Next.js + Supabase; the ingest API (verify signature → upsert `uls` +
   append `events`); the `uls`/`events` schema; the death-sweep cron.
3. **Website (same repo):** the gallery + the web sprite renderer + the claim flow.
4. **Later:** Solana birth-certificate/token off the same keypair.

## Open decisions
- Domain (`saulene.xyz`?), exact opt-in copy, whether claiming needs a website account at all (could
  be pure key-possession + a shareable URL), heartbeat frequency/rate-limit.
