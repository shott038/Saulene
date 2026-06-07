# Mission: switch plugin/hooks to S1 delivery (voice in the conversation channel)

**Started:** 2026-06-06
**Branch:** claude/s1-delivery
**Parent:** main @ 627fb68

## Goal
The A/B validation proved a measured win: delivering the ul voice in the **conversation channel**
(S1) makes it far more noticeable than appending it to Claude Code's ~20k-token system prompt (S0) —
blind distinguishability **0.33 → 0.71**. Today `plugin/hooks` SessionStart injects the rendered
voice as system-prompt-level context (the S0 mechanism). Switch the plugin to deliver at S1 so the
shipped product gets that noticeability win. Keep everything else intact: level-gating, the
neglect-death check + `lastUsedAt` bump, and the Stop→drift pipeline.

## The key design question — VERIFY hook mechanics, don't guess
"S1 / conversation channel" was achieved in the harness by **prepending the voice to the user
prompt** (`claude -p "<voice>\n\n<prompt>"`), i.e. recent-token / user-turn position. A `SessionStart`
hook's `additionalContext` lands as session/system-level context (≈ S0), so it may NOT reproduce S1.
Determine the faithful path:
- Most likely: a **`UserPromptSubmit` hook** that prepends the rendered voice to (or alongside) the
  user's prompt is the real-plugin analog of S1. Confirm how Claude Code delivers `UserPromptSubmit`
  additionalContext vs `SessionStart` additionalContext (check the Claude Code hooks docs / the
  claude-code-guide knowledge) before implementing.
- Decide the cleanest faithful design: e.g. SessionStart still handles birth/gating/death + a
  lightweight presence, and a UserPromptSubmit hook carries the voice into the conversation channel.
  Avoid re-rendering expensively every turn — cache the rendered voice per session (it's pure in the
  soul state, which doesn't change mid-session) and reuse; re-inject (S1 wants it in the recent
  context) without re-running perception.
- Whatever the mechanism: preserve level-gating (dormant in project repos / wrong level), the
  not-born and neglect-death dormancy, and the `soulHash` stamp for replay.

## Key files
- `packages/plugin/src/hooks/session-start.ts` — S1: now returns null; renders + writes cache + bumps lastUsedAt
- `packages/plugin/src/hooks/session-cache.ts` — NEW: writeSessionCache / readSessionCache (session-injection.json)
- `packages/plugin/src/hooks/user-prompt-submit.ts` — NEW: reads cache, returns injection as additionalContext per turn
- `packages/plugin/src/hooks/index.ts` — updated exports + manifest wiring note
- `packages/plugin/src/hooks/config.ts` (gating — unchanged), `stop.ts` (drift — unchanged)
- `packages/plugin/test/hooks.test.ts` — updated + extended (39 tests, all pass)
- Evidence/context: `tools/harness/SALIENCE-FINDINGS.md` (the S0→S1 result), `docs/ab-validation-plan.md`

## Out of scope
- Setup wizard / neglect-death wizard UI, plugin manifest / `/plugin` install — separate bricks
  (BUT: if S1 needs a new hook type, note the manifest wiring needed so the manifest brick picks it up)
- Renderer changes (text layers, knobs) — the voice content is unchanged; this is a delivery switch
- Do NOT add IO/LLM/clock/entropy to `core`/`renderer`; all IO stays at the plugin edge

## Hook mechanics — verified
- `SessionStart` additionalContext: before first prompt, at session-start position → **S0** (washes out)
- `UserPromptSubmit` additionalContext: "alongside the submitted prompt" on every turn → **S1 analog** (recent-token position)
- No mechanism exists to modify the user message text itself; additionalContext is always a system reminder

**Design chosen:** SessionStart = gating + cache-write + lastUsedAt bump (returns null). UserPromptSubmit = reads cache, returns voice as additionalContext per turn. The voice is rendered once (pure in soul state, soul doesn't change mid-session) and reused cheaply via `session-injection.json`.

## Manifest wiring note (for the manifest brick)
The S1 delivery requires:
1. Wire a `UserPromptSubmit` hook that runs `userPromptSubmit()` and returns `{ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: entry.text } }` when non-null.
2. Wire a `SessionStart` hook that calls `sessionStart()` for side effects — do NOT wire its return value as additionalContext (it returns null; the system-prompt channel would be S0, which we're moving away from).

## Status
Status: ready-to-merge

## Verification
- Build: pass (`pnpm run build` — clean, no new errors)
- Tests: pass (291 passed across 13 files; `packages/plugin/test/hooks.test.ts` 39 tests)
- Scope kept: yes — gating, neglect-death, lastUsedAt bump, and Stop drift pipeline all intact; core/renderer untouched; only plugin/hooks evolved
- Summary: switched voice delivery from S0 (SessionStart additionalContext → system prompt, 0.33 distinguishability) to S1 (UserPromptSubmit additionalContext → alongside user prompt per turn, 0.71 distinguishability) via a session cache file written at session start and read cheaply per turn
