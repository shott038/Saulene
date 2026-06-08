# Mission: Make the Stop hook fail safe when perception (claude -p) errors

**Started:** 2026-06-07
**Branch:** claude/harden-stop-hook
**Parent:** main @ 40bb25b

## Goal
In a real install, the Stop hook (fires every session end) shells out to `claude -p` to perceive the session for drift. When that subprocess failed with `{"is_error":true,"result":"Not logged in · Please run /login"}` (exit 1), the hook threw an UNHANDLED error and dumped a full Node stack trace into the user's session. Perception is BEST-EFFORT drift — any failure to reach the model (not-logged-in, offline, rate-limited, non-zero exit, malformed envelope) must silently skip consolidation for that session: never crash, never dump a stack trace. The soul must be left untouched.

**DONE =** when `claude -p` fails for any reason, the Stop hook skips drift silently, prints at most ONE friendly line, exits 0, never dumps a stack trace, and the soul is unchanged. `pnpm check` green; source + regenerated bundle + version bump committed together.

## Root cause (already traced)
- `packages/plugin/src/hooks/stop.ts` — the perceive loop (~lines 87-108) only catches `PerceptionError` and RE-THROWS everything else (`throw err` ~line 99). The `claude -p` "Not logged in" failure surfaces as a plain `Error` thrown by `defaultSpawn` in `cli-llm.ts` (exit code !== 0), which is NOT a PerceptionError, so it propagates out of `stop()`.
- `packages/plugin/src/bin/hook-stop.ts` — the top-level `await stop({...})` (~line 47) has NO try/catch, so the propagated error becomes an unhandled rejection → the stack trace the user saw. (The existing try/catch at lines 35-41 only guards reading the transcript.)

## The fix (three layers)
1. **stop.ts — swallow ALL perception/LLM failures, not just `PerceptionError`.** During the perceive phase, catch transport/CLI/network/auth errors (the "claude -p exited 1: Not logged in" Error, ECONNREFUSED, timeouts, malformed-envelope Errors from cli-llm.ts) the SAME way `PerceptionError` is handled: log a concise non-fatal line and `return` without consolidating. Soul left untouched (never partial). Keep the existing PerceptionError retry (malformed JSON → retry once) intact; the new breadth is for the non-PerceptionError transport failures that currently re-throw.
2. **bin/hook-stop.ts — fail safe no matter what.** Wrap `await stop(...)` in try/catch. On ANY error: do NOT print a stack trace; write the normal `{"continue":true}` line to stdout and exit 0. At most one concise human line to stderr. A Stop hook must never break or visibly error the user's session.
3. **Friendly not-logged-in hint (concise, non-spammy).** When the failure is specifically auth ("Not logged in" / "/login" / "Please run /login"), surface ONE short friendly line (not a stack trace), e.g. `Saulene: personality drift is paused — run \`claude\` in a terminal and log in (or set SAULENE_PERCEPTION_API_KEY) to enable it.` One line. If easy, gate so it doesn't print every session (once/day or on-change); a single concise line per session is acceptable if gating is awkward.

NOTE: `claude -p` "Not logged in" is environment-specific (headless CLI login is separate from the spawned context). We are NOT fixing the auth itself — the deliverable is graceful degradation + the friendly hint. Don't over-engineer.

## Key files
- `packages/plugin/src/hooks/stop.ts` (error handling)
- `packages/plugin/src/bin/hook-stop.ts` (top-level fail-safe + hint)
- `packages/plugin/src/hooks/cli-llm.ts` (read only — the source of the thrown transport Error)
- `packages/plugin/test/hooks.test.ts` (or wherever stop() is tested) — new tests
- `packages/plugin/dist/bin/hook-stop.js` (regenerated bundle)
- `packages/plugin/.claude-plugin/plugin.json` (version bump)

## Verify / tests
- Add stop() test: injected `LlmClient.complete()` REJECTS with `new Error('claude -p exited 1: {"is_error":true,"result":"Not logged in · Please run /login"}')` → stop() RESOLVES (no throw) AND soul on disk unchanged (load before/after deep-equal; lastUsedAt + mp untouched; no ledger/diary rows appended).
- Add stop() test: generic transport rejection (`new Error('ECONNREFUSED')`) → same graceful no-op.
- Confirm the existing PerceptionError retry test still passes.
- `pnpm check` green (boundaries + lint + typecheck + tests).

## Rebundle + version bump (CRITICAL)
- After editing source: `pnpm bundle` (or `pnpm --filter @saulene/plugin bundle`) to regenerate `packages/plugin/dist/bin/hook-stop.js` (+ any other affected bundle); commit the regenerated bundle(s) in the SAME commit. `git status` after bundling shows only source + tracked bundles.
- Bump `packages/plugin/.claude-plugin/plugin.json` version `0.1.2` → `0.1.3` in the same commit. Claude Code caches by version; without a bump nobody gets the fix.

## Out of scope
- The drift math, the perception prompt, the reporter, the happy-path behavior when `claude -p` works. Do NOT try to fix the underlying claude-CLI auth.

## Verification
- Build: pass
- Tests: pass (502 passed, 2 new: not-logged-in + ECONNREFUSED transport error cases)
- Scope kept: yes — only the perceive error-handling path, bin failsafe, and the two new tests
- Summary: stop() swallows all transport/CLI/auth perception failures; hook-stop.ts exits 0 always; friendly auth hint; bundle regenerated; plugin.json bumped to 0.1.3

## Status
Status: ready-to-merge
