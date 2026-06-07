# Plan: drift perception via `claude -p` headless — no API keys, for anyone

**Status:** planned. Today the Stop-hook drift perception uses `AnthropicLlmClient`, which needs
`ANTHROPIC_API_KEY`. That's a non-starter for distribution (users won't all have a key) and even an
annoyance for the author. Switch perception to run through the user's **existing Claude Code login**
via `claude -p` headless — so the drift loop works for **every installed user with zero key setup**,
covered by whatever Claude plan they already pay for. Force **Haiku**. The transcript never leaves
the machine (the `claude -p` call runs locally).

## Goal
- Perception (the one LLM call in the drift loop) runs via `claude -p --model <haiku>` using the
  logged-in Claude Code auth. **No `ANTHROPIC_API_KEY` required — for users OR the author.**
- Haiku only, low temperature, single structured-extraction call.
- CI/tests still use the deterministic `FakeLlmClient` (never a live call).

## What to build
1. **A plugin `ClaudeCliClient implements LlmClient`** (`packages/plugin/src/hooks/` — e.g.
   `cli-llm.ts`). `complete(prompt) → Promise<string>` shells out to:
   `claude -p "<prompt>" --model claude-haiku-4-5-20251001 --output-format json`
   with tools disabled, parses the JSON envelope, returns the model's text (which is the perception
   JSON). **Reuse the proven pattern in `tools/harness/src/llm.ts`** (its `ClaudeCliClient` already
   does exactly this — claude -p, json output, model pin). Inject the spawn fn so tests fake it.
2. **Wire `hook-stop.ts` to use `ClaudeCliClient` by default** instead of `AnthropicLlmClient`.
   No env key needed.
3. **`AnthropicLlmClient` becomes an optional override**, not the default: e.g. use it only if an
   explicit opt-in is set (env `SAULENE_PERCEPTION_API_KEY` / config). Otherwise CLI. (Or remove it
   entirely — decide; keeping it as a documented override is cheap and handy for CI determinism.)

## ⚠️ THE CRITICAL LANDMINE — recursion / fork-bomb
The Stop hook fires at the end of a Claude Code session. If it spawns `claude -p`, that headless
invocation is **itself a full Claude Code session** → it loads the Saulene plugin → its hooks fire:
- its **UserPromptSubmit** would inject the ul voice into the perception prompt (**biases/corrupts
  perception**), and
- its **Stop** would spawn ANOTHER `claude -p` → **infinite recursion / fork bomb.**

This MUST be guarded:
- **Env sentinel:** when the perception client spawns `claude -p`, set an env var (e.g.
  `SAULENE_PERCEPTION=1`). **Every Saulene hook bin entry** (`hook-session-start`,
  `hook-user-prompt-submit`, `hook-stop`) checks it FIRST and **no-ops immediately** when set. This
  alone fully prevents recursion + perception-prompt pollution. (Belt.)
- **Prefer also not loading the plugin** in the perception call if a flag exists (e.g. a
  `--no-plugins`/settings-based way to run `claude -p` without hooks). VERIFY whether Claude Code
  supports this; if so use it too. (Suspenders.) The env sentinel is the guaranteed mechanism;
  this is a bonus.
- Restrict the perception `claude -p` to no tools (it's a pure extraction call).

## Things to VERIFY (don't assume)
- That `claude -p` invoked **from inside a Stop-hook subprocess** actually inherits/reads the user's
  Claude Code auth and completes (the harness proved `claude -p` works from a normal shell; confirm
  it works in the hook subprocess context).
- The exact `--output-format json` envelope shape + which field holds the model text (mirror the
  harness parser).
- That `--model` accepts the Haiku id/alias under a subscription.

## Failure + UX
- If `claude -p` fails (not logged in, error, recursion-guard no-op) → perception throws →
  existing fail-safe leaves the soul **untouched** (no drift, no crash). Log one clear line, e.g.
  "drift skipped: perception unavailable".
- Latency: `claude -p` boots a session per session-end. Acceptable at Stop; consider running the
  drift detached so it never delays the user. Note it.

## Tests
- `ClaudeCliClient`: injected spawn → assert command/flags (model pinned to haiku, json format,
  SAULENE_PERCEPTION set), output parsing, error path. Zero real process spawns in tests.
- Hook recursion guard: each hook entry no-ops when `SAULENE_PERCEPTION=1`.
- Perception's own suite stays on `FakeLlmClient` (unchanged). `pnpm check` green.

## Docs
- Update README/SPEC: drift perception uses your existing Claude Code login (no API key needed);
  Haiku; transcript stays local. Remove any "needs ANTHROPIC_API_KEY" implication.

## Net effect
Install the plugin → drift just works on the user's own Claude auth, no keys, you pay nothing, the
transcript never leaves the machine. Same for the author (no key needed).
