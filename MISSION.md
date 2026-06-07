# Mission: plugin manifest — wire everything into an installable Claude Code plugin

**Started:** 2026-06-06
**Branch:** claude/plugin-manifest
**Parent:** main @ 49bb928

## Goal
Stitch the finished pieces into a real, installable Claude Code plugin. The manifest declares and
wires:
1. **Hooks** (per the S1-delivery design — see `packages/plugin/src/hooks/index.ts` "manifest wiring
   note"):
   - **SessionStart** → runs `sessionStart()` for SIDE EFFECTS ONLY (gating + render-and-cache +
     `lastUsedAt` bump). Do NOT wire its return as `additionalContext` (it returns null; that channel
     would be the abandoned S0 system-prompt delivery).
   - **UserPromptSubmit** → runs `userPromptSubmit()` and returns the voice as `additionalContext`
     (the S1 conversation-channel delivery — the validated noticeability win).
   - **Stop** → runs the `stop()` drift pipeline (perceive → consolidate → persist).
2. **MCP server** — the read-only state/identity server (`packages/plugin/src/mcp`, `bin.ts` stdio
   entry) declared so the agent can query the ul (`ul_snapshot`/`ul_drift`/`ul_countdown`).
3. **Skill / command** — the `/ul` command (`packages/plugin/src/skill`).
4. **Install via `/plugin`** + a **bare-MCP portability fallback** (per SPEC): the MCP server must be
   usable standalone for hosts that can't run the full plugin, degrading gracefully.

## VERIFY the manifest schema — don't guess
Confirm the current Claude Code **plugin manifest** format (file name/location, how hooks / MCP
servers / commands are declared, the `/plugin` install flow) against the Claude Code docs / the
claude-code-guide knowledge before authoring it. Hook handlers must be invoked the way Claude Code
expects (stdin payload → stdout JSON with `hookSpecificOutput`), so add thin CLI entry wrappers
around the existing `sessionStart()` / `userPromptSubmit()` / `stop()` functions if needed.

## Key files (expected)
- The plugin manifest file (name/location per the verified schema) + any thin hook-entry wrappers
- Reuse: `packages/plugin/src/hooks/` (the three handlers), `mcp/` (server + `bin.ts`), `skill/`
- Read first: `SPEC.md` (plugin manifest + bare-MCP fallback), `docs/ARCHITECTURE.md`, Phase 4 in
  `BUILD_GUIDE.md`, and `packages/plugin/src/hooks/index.ts` (the wiring note)

## Coordination note
A sibling worktree (`claude/setup-wizard`) is building the first-run wizard in parallel. If the
manifest needs a first-run/setup entry, wire to the wizard's exported entry point (don't duplicate
its logic). Keep changes to shared files (`hooks/index.ts`, `config.ts`) minimal + additive.

## Out of scope
- The wizard flow itself (sibling brick) — just wire to its entry if present
- Renderer/engine changes; Phase-5 registry/token
- Do NOT add IO/LLM/clock/entropy to `core`/`renderer`/`storage`

## Verification
- `pnpm --filter @saulene/plugin build` — passes (0 errors)
- `pnpm test` — 276/276 tests pass; pre-existing `harness/metrics.test.ts` failure is unrelated (`@saulene/simulator` missing, not introduced here)
- Compiled bin files confirmed at `dist/bin/`: `hook-session-start.js`, `hook-user-prompt-submit.js`, `hook-stop.js`, `skill-ul.js`

## Phase 1 ✅ DONE — committed at ab2af42
Manifest, hooks.json, .mcp.json, bin wrappers, /ul skill — all wired + committed. BUT a gap remains
(below).

---

## Phase 2 — wire the interactive first-run wizard (IN PROGRESS)
Phase 1 wired hooks/MCP/skill but **nothing invokes the birth/setup wizard**, so the plugin installs
but a user can never birth a ul (SessionStart stays permanently dormant — no soul). This branch
predated the wizard; `runWizard` now exists on main. Close the gap.

**First: `git merge main`** to pull in `runWizard` (`packages/plugin/src/setup/wizard.ts`, exported
via `src/setup/index.ts`) + `saveConfig`. Read `packages/plugin/src/setup/wizard.ts` to see exactly
what `runWizard` expects (it's dep-injected — it takes injected IO/prompt callbacks, birth entropy,
storage root, `now`).

**Build the setup entry — interactive, in the terminal (NOT a print-style skill):**
- A **`src/bin/setup.ts`** CLI entry (`dist/bin/setup.js`) that drives `runWizard` with REAL
  interactivity: Node `readline` (or similar) for the reality-warning acknowledgement + the level
  pick, real `Date.now()`/entropy/`defaultRoot()` injected, and play the **birth animation**
  (`plugin/statusline` `playBirth()`) during the watch-only birth beat. This is the one place real
  stdin/stdout interactivity is appropriate.
- A **`/ul-setup` (or `saulene-setup`) skill** (`skills/ul-setup/SKILL.md`) that tells the user to
  run the setup program in their terminal (interactive flows don't fit a print-style skill — point
  them to `node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js`, or use the `! <command>` pattern).
- Make sure SessionStart's "no soul yet" path is coherent with this (the `/ul` skill already tells
  users with no ul to run setup — keep that message consistent with the actual setup command).

**Verify FULLY (the Phase-1 276 was a worktree artifact — simulator dist wasn't built):** after
`git merge main` + `pnpm install` + `pnpm build`, run the FULL `pnpm test` from the repo root — it
must be **≥305 green** (matching main), `pnpm build` clean, `pnpm check:boundaries` clean. Confirm
`dist/bin/setup.js` is emitted. Do NOT report ready until the full suite is green on a real build.

## Out of scope (unchanged)
- Renderer/engine changes; Phase-5 registry/token; do NOT make `core`/`renderer`/`storage` impure.

## Phase 2 ✅ DONE
- `src/bin/setup.ts` → `dist/bin/setup.js` — interactive terminal wizard entry (readline + real entropy/Date.now/defaultRoot)
- `skills/ul-setup/SKILL.md` — `/ul-setup` skill points users to `! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js`
- `/ul` skill "no output" message updated to reference `/ul-setup` + the direct command
- 305/305 tests green, build clean, boundaries clean

## Status
Status: ready-to-merge
