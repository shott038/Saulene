# Mission: drift perception via `claude -p` headless — no API keys

**Started:** 2026-06-07
**Branch:** claude/cli-perception
**Parent:** main @ 7c02117

Full design: **`docs/cli-perception-plan.md`** (read it first, in full). Swap the Stop-hook drift
perception from the API-key `AnthropicLlmClient` to a `ClaudeCliClient` that uses the user's existing
Claude Code login via `claude -p --model haiku` — so drift works for every installed user (and the
author) with **zero API-key setup**, on their own Claude plan, transcript staying local.

## #1 ACCEPTANCE CRITERION — the recursion guard (do this FIRST, get it right)
`claude -p` spawned from the Stop hook is itself a full Claude Code session → it reloads the Saulene
plugin → its hooks fire → its `Stop` spawns another `claude -p` → **infinite fork bomb**, and its
`UserPromptSubmit` would inject the ul voice into the perception prompt (corrupting perception).
GUARD IT:
- When the perception client spawns `claude -p`, set env **`SAULENE_PERCEPTION=1`** on the child.
- **Every** hook bin entry (`hook-session-start.ts`, `hook-user-prompt-submit.ts`, `hook-stop.ts`)
  must check `process.env.SAULENE_PERCEPTION` FIRST and **no-op immediately** (print `{continue:true}`
  and exit) when set. This fully prevents recursion + prompt pollution.
- Also restrict the perception `claude -p` to no tools, and if Claude Code supports running it
  without plugins/hooks (a `--no-plugins`/settings flag), use that too as belt-and-suspenders. VERIFY
  whether such a flag exists; the env sentinel is the guaranteed mechanism regardless.
- Add a test proving each hook entry no-ops under `SAULENE_PERCEPTION=1`.

## Build
1. `packages/plugin/src/hooks/cli-llm.ts` — `ClaudeCliClient implements LlmClient`: `complete(prompt)`
   shells `claude -p "<prompt>" --model claude-haiku-4-5-20251001 --output-format json` (tools off),
   parses the JSON envelope → returns the model text. **Reuse the proven pattern in
   `tools/harness/src/llm.ts`** (its ClaudeCliClient). Inject the spawn fn so tests fake it (zero
   real process spawns in tests).
2. `hook-stop.ts` — use `ClaudeCliClient` by default (no env key). Keep `AnthropicLlmClient` only as
   an OPTIONAL override (e.g. used if an explicit `SAULENE_PERCEPTION_API_KEY` is set), or remove it —
   your call, but CLI is the default and the no-key path must be the one that ships.

## VERIFY before declaring done (don't assume)
- That `claude -p` invoked **from inside a Stop-hook subprocess** actually authenticates via the
  user's Claude Code login and returns output. If you can't fully verify in this environment, say so
  explicitly in the verification notes — do NOT claim it works untested.
- The `--output-format json` envelope shape + which field holds the model text (mirror the harness).
- `--model` accepts the Haiku id under a subscription.

## Failure + tests
- `claude -p` failure / not-logged-in / the recursion no-op → perception throws → the EXISTING
  fail-safe in `stop()` leaves the soul untouched (no drift, no crash). Log one clear line.
- Tests: ClaudeCliClient (injected spawn: assert haiku model + json format + SAULENE_PERCEPTION set +
  parsing + error path); the per-hook recursion no-op; perception suite stays on FakeLlmClient.
  `pnpm check` green.

## Docs
- Update README/SPEC: drift uses your existing Claude Code login (no API key); Haiku; transcript
  stays local. Remove any "needs ANTHROPIC_API_KEY" implication.

## Constraints
- `core`/`renderer`/`storage`/`perception` stay pure (perception keeps its injected `LlmClient` port).
  All subprocess IO is plugin-edge. `pnpm check:boundaries` green.

## Status
Status: in-progress
