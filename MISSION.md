# Mission: Make /ul-setup work natively inside Claude Code (no raw terminal)

**Started:** 2026-06-07
**Branch:** claude/native-setup
**Parent:** main @ 4015555

## Goal
Most people install Saulene via Claude Code inside the folder they want it in, then run `/saulene:ul-setup`. Today the skill just tells them to run `! node .../dist/bin/setup.js` — an interactive `readline` wizard. Claude Code's `!` inline runner gives it NO interactive TTY stdin, so the wizard prints the reality-warning prompt then hangs/crashes: `Warning: Detected unsettled top-level await ... await runWizard(...)`. (Node v22.18 is fine; the cause is interactivity — it blocks on `readline()` for stdin that never arrives.) Fix it so setup works natively inside a Claude Code session: Claude collects the answers in chat, then runs a one-shot NON-interactive command with flags. Keep the interactive raw-terminal wizard working for people who prefer it.

**DONE =** a user who installed via Claude Code runs `/saulene:ul-setup`, acknowledges the reality warning in chat, picks where the ul lives, and gets a born ul — entirely inside Claude Code, no separate terminal, no unsettled-await hang. `pnpm check` green, source + regenerated bundle committed together.

## The fix

### 1. Non-interactive setup path (`packages/plugin/src/setup/` + `bin/setup.ts`)
- `runWizard` (src/setup/wizard.ts) is already DI'd (write/readline/sleep/storageRoot/now/entropy/mode). Add a sibling **non-interactive** function (e.g. `runSetup(opts)`) doing the same beats with NO readline: takes `acknowledged: boolean`, `scope: "global"|"dir"`, `dir?: string`, `reporterEnabled?: boolean` (default true) + the same injected storageRoot/now/entropy/mode/write/sleep. It must:
  - guard already-born (friendly msg, return)
  - **REQUIRE `acknowledged===true`** — if false, write a clear message and return WITHOUT birthing (the mandatory reality-warning ack must be preserved)
  - seed + birth (animation via write/sleep), `saveSoul`, `loadOrCreateKeypair`, `saveConfig` (`{level:"global",bornAt}` or `{level:"named-dir",dir,bornAt}`), fire the born `reportEvent`
  - respect `reporterEnabled`: if false, persist `reporterEnabled:false` into config so the reporter stays off (check how hooks/config.ts + reporter.ts read the opt-out and wire it correctly)
- `bin/setup.ts`: parse argv.
  - Flags present → call `runSetup` non-interactively. Flags: `--yes`/`-y` (acknowledge), `--scope global|dir`, `--dir <path>` (required when scope=dir), `--reporter on|off` (default on), `--mode dark|light` (default dark), `--no-anim`.
  - No flags + `stdin.isTTY` → existing interactive `runWizard` (do NOT remove it).
  - No flags + NOT a TTY → print a clear one-line message (run `/ul-setup`, or run setup.js in a real terminal) and exit cleanly. **It must NEVER hang on an unsettled await again.**
- **Birth animation in captured output:** the `!` runner captures stdout; cursor-up redraw escapes render messily. `--no-anim` (or auto-detect non-TTY) renders a simpler sequential/static birth (a few non-redrawing frames + the final sprite) so the native flow still shows a birth moment. Keep the full animation for the TTY path.

### 2. Skills
- Rewrite `packages/plugin/skills/ul-setup/SKILL.md` to drive natively: Claude shows the reality-warning text IN CHAT (include it verbatim), REQUIRES the user to type "yes" (Claude must NOT pass `--yes` unless the user actually acknowledged — preserve the mandatory ack, no auto-acknowledge), then asks where the ul lives (global vs this directory — offer the cwd path) and optionally reporter on/off, then runs ONE command via `!`: `! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js --yes --scope global --no-anim` (or `--scope dir --dir <abs path>`, `--reporter off` if chosen). Show birth output, confirm alive, tell them to type `/ul`. Keep the raw-terminal command as a documented fallback.
- Update `packages/plugin/skills/ul/SKILL.md` "no ul yet" fallback to point at native `/ul-setup`, not a raw-terminal setup.js command.

### 3. Rebundle + recommit (CRITICAL)
The committed `dist/` is what users run. After editing source, run `pnpm bundle` (or `pnpm --filter @saulene/plugin bundle`) to regenerate `packages/plugin/dist/bin/setup.js` (and `skill-ul.js` if touched) and commit the regenerated bundle(s) in the SAME commit. `.gitignore` keeps tsc junk out, so `git status` after bundling shows only source + the 6 tracked bundles. Skip the rebundle and the fix won't ship.

### 4. README
Update the install/setup section so the primary path is "in Claude Code, run `/ul-setup`" (native, no terminal), with the raw `node .../setup.js` command kept as an alternative.

## Verify
- `pnpm check` green (boundaries + lint + typecheck + tests). Add/adjust tests: `runSetup` non-interactive (births + writes soul/config, zero readline, deterministic via injected entropy/now/temp root); the `acknowledged===false` guard (no birth); argv flag parsing. Update existing wizard tests as needed.
- Prove native path manually (non-TTY): `node packages/plugin/dist/bin/setup.js --yes --scope global --no-anim` against a TEMP storage root (use a temp dir / env — do NOT clobber Samuel's real `~/.saulene`; clean up after) births a ul + writes soul.json+config.json WITHOUT hanging. Confirm no-flags + non-TTY prints the helpful message and exits instead of hanging.
- Confirm regenerated `dist/bin/setup.js` has the new flag handling and does not hang.

## Out of scope
- The engine/birth math. The reporter default-on decision (keep ON unless `--reporter off`). Anything unrelated. Do NOT remove the interactive raw-terminal wizard.

## Verification
- Build: pass (tsc -b clean, pnpm check green)
- Tests: pass (500 passed — 27 wizard tests include 16 new runSetup tests)
- Scope kept: yes — interactive wizard untouched, dist rebundled, README + skills updated
- Summary: `runSetup` (flag-driven, no readline), `playBirthStatic` (static keyframes), `bin/setup.ts` TTY-routing, ul-setup SKILL.md native flow, regenerated dist/bin/setup.js

## Final notes
- Verified: `node setup.js < /dev/null` → clean exit with helpful message (no hang)
- Verified: `node setup.js --yes --scope global --no-anim` → births ul without hanging
- Verified: already-born guard fires correctly on second run
- The non-interactive flag parsing in bin/setup.ts does not include `--storage-root` (intentional; tests use injected storageRoot via the SetupOpts API)

## Status
Status: ready-to-merge
