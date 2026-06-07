# Mission: plugin reporter — opt-in, signed heartbeat + lifecycle events to the registry

**Started:** 2026-06-07
**Branch:** claude/plugin-reporter
**Parent:** main @ ca7a5c6

## Goal
The plugin-side half of the Phase-5 registry (`docs/registry-website-plan.md`): an **opt-in** module
that reports a ul's **public fingerprint** + lifecycle events to the registry, **signed with the ul's
private key** so the server can verify authenticity. This makes uls show up on the future gallery —
but the reporter must be fully self-contained and harmless even though the registry API/website
doesn't exist yet (fire-and-forget, never blocks or breaks a session).

The keypair + `sign()` already exist (`packages/plugin/src/identity/`). The DB schema already exists
(tables `uls` + `events`). This brick is the pipe between them.

## Requirements
1. **Opt-in, default OFF.** Add a registry opt-in to config (`packages/plugin/src/hooks/config.ts` /
   `saveConfig`) and a prompt in the setup wizard (`setup/wizard.ts`) — explicit consent, framed
   honestly (what's shared, that it's public, that the private soul never leaves). If not opted in →
   the reporter is a complete no-op.
2. **Public fingerprint ONLY — never private content.** Send: `pubkey` (the base58 public id), `mbti`,
   `aspects` (the 10 values), `stage`, `mp`, `sex`, `status`, `born_at`. **NEVER** diary, voice
   samples, ledger, or any message content. (Map from the existing `mcp/snapshot.ts` read path where
   possible — it already assembles the public snapshot.)
3. **Signed.** Sign the payload (canonical JSON + a timestamp/nonce to prevent replay) with the ul's
   private key via `identity` `sign()`. The server verifies against `pubkey`. Include the signature
   + the signed bytes in the request.
4. **What & when to report:**
   - **heartbeat** (with current fingerprint) — on **SessionStart** (signals the ul is alive +
     upserts its current public state; drives the server's `last_seen` / death-sweep).
   - **lifecycle events** — on **Stop** (the drift pipeline): emit `stage_change` and `rupture`
     events when the consolidation actually produced one (detect from the soul before/after, or
     reuse whatever the engine already surfaces). Emit `born` once at setup.
   - Keep it minimal; do not spam (one heartbeat per session is enough).
5. **Resilient + non-blocking (critical).** The registry may be unreachable or unconfigured. The
   reporter MUST: run async/fire-and-forget, never block the hook, swallow all network errors
   (optional debug log only), and time out fast. A down registry must NEVER degrade the user's
   session or the drift pipeline.
6. **Endpoint configurable, default inert.** Registry base URL via env (e.g. `SAULENE_REGISTRY_URL`)
   and/or config. If unset → no-op (don't hardcode a live endpoint that 404s every session). Document
   the env var.
7. **Injected transport for tests.** The HTTP POST goes through an injected `fetch`-like port so tests
   assert the signed payload shape + opt-in gating + no-op-when-disabled with ZERO real network.

## Out of scope
- The registry API / server / signature *verification* side (new website repo)
- The website/gallery, the `/ul claim` web handshake, the death-sweep cron (server-side), the token
- Changing `core`/`renderer`/`storage` (stay pure; the reporter is plugin-edge IO only)

## Definition of done
- Opt-in reporter: heartbeat on SessionStart + events on Stop + born at setup, signed, public-
  fingerprint-only, fire-and-forget, no-op when opted out or unconfigured. Tests cover payload shape,
  signing, opt-in gating, and graceful failure (injected transport, no real IO). `pnpm check` green.

## Key files
- `packages/plugin/src/reporter/reporter.ts` — new: FetchFn transport, signFingerprint, reportHeartbeat, reportEvent
- `packages/plugin/src/hooks/config.ts` — extended LevelConfig with reporterEnabled + bornAt
- `packages/plugin/src/setup/wizard.ts` — added step 4 opt-in prompt + born event
- `packages/plugin/src/hooks/session-start.ts` — fires reportHeartbeat fire-and-forget
- `packages/plugin/src/hooks/stop.ts` — detects stage_change/rupture + fires events
- `packages/plugin/test/reporter.test.ts` — new: 19 tests with injected fetch

## Verification
- Build: pass
- Tests: pass (338 passed, 19 new reporter tests)
- Scope kept: yes — only plugin-edge files touched; core/renderer/storage untouched
- Summary: opt-in reporter fires signed heartbeat on SessionStart + lifecycle events on Stop/wizard; no-op when unset; 19 tests cover shape, signing, gating, graceful failure

## Status
Status: ready-to-merge
