# Mission: registry reporting ON BY DEFAULT (disclosed, easy opt-out)

**Started:** 2026-06-07
**Branch:** claude/registry-default-on
**Parent:** main @ a7058e8

## Goal
Change registry reporting from **opt-in** to **on by default**. A newly-born ul reports its PUBLIC
fingerprint to the gallery automatically — no permission gate. BUT it must be **disclosed** (a clear
notice + an easy opt-out), never silent, and the docs must be corrected so we don't ship a false
privacy claim. Public-fingerprint-only and all the existing guarantees (signed, fire-and-forget,
never private content) stay exactly as they are.

## Changes

### 1. Reporter gate — default on (`packages/plugin/src/reporter/reporter.ts`)
Currently `if (!config?.reporterEnabled) return;` (off unless explicitly true). Flip the semantics:
**absence = ON; only an explicit `reporterEnabled === false` disables.** So:
`if (config?.reporterEnabled === false) return;` (and still no-op if there's no config at all / not
set up). Apply to BOTH `reportHeartbeat` and `reportEvent`.

### 2. Config (`packages/plugin/src/hooks/config.ts`)
`reporterEnabled` stays an optional boolean, but the *meaning* is now "off only when false." Update
any comments/types so the default-on semantics are clear. (No need to write `true` everywhere —
undefined already means on under the new gate — but the wizard MAY write `reporterEnabled: true`
explicitly for clarity, and must write `false` when the user opts out.)

### 3. Wizard (`packages/plugin/src/setup/wizard.ts`) — DISCLOSE, don't ask
Replace the current yes/no opt-in (Step 4) with a **disclosure notice** (not a gate): tell the user
their ul will appear on the public Saulene gallery, that ONLY public data is shared (type, aspects,
stage, public key) and diary/voice/private soul NEVER leave the machine, and exactly how to opt out
(set `reporterEnabled: false` in `<root>/config.json`). Then proceed with reporting enabled by
default. Optionally accept a single keystroke to opt out right there (e.g. "press o to opt out,
anything else to continue") — but default is ON. Keep the `born` event firing (now fires by default).

### 4. Docs honesty (REQUIRED — do not skip)
The README currently says, in "How it actually works": *"Everything personal lives locally in
`soul.json` plus an append-only history; the only outbound calls are the model calls Claude Code
already makes."* That is now FALSE. Update it (and any similar line in `SPEC.md` / the reality
warning area) to state plainly: by default an opted-in... no — by default the ul shares its **public
fingerprint** with the gallery (list exactly what), the **private soul never leaves**, and how to opt
out. Be accurate and upfront.

## Constraints
- Public fingerprint ONLY — never diary, voice, ledger, message content. (Unchanged.)
- Signed + fire-and-forget + default-registry-URL wiring — all unchanged.
- `core`/`renderer`/`storage` stay pure. `pnpm check:boundaries` green.

## Tests
- Update reporter tests: default config (no `reporterEnabled`) → REPORTS; `reporterEnabled: false` →
  no-op; the old "no-op when not opted in" expectation flips. Keep the explicit-disable + empty-URL +
  graceful-failure cases.
- Update wizard tests: no longer a yes/no gate; shows the disclosure; results in reporting enabled by
  default; opt-out path (if you add the keystroke) sets `false`.

## Definition of done
- Reporting is ON by default, disclosed in the wizard, opt-out documented + working. README/SPEC
  corrected (no false "nothing but model calls leaves" claim). `pnpm check` green.

## Verification
- Build: pass
- Tests: pass (351 passed, 16 test files)
- Scope kept: yes
- Summary: reporter gate flipped to default-on; wizard replaced yes/no opt-in with disclosure + 'o' opt-out; README/SPEC corrected; all tests green

## Status
Status: ready-to-merge
