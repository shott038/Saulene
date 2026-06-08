# Mission: Replace the dead saulene.app link in /ul with a "gallery coming soon" teaser + GitHub star CTA

**Started:** 2026-06-07
**Branch:** claude/ul-gallery-teaser
**Parent:** main @ 64d8271

## Goal
The `/ul` command currently ends with `See your full breakdown → https://saulene.app/ul/<id>`. That site does NOT exist yet (the gallery is a deferred, popularity-gated feature), so the link 404s for every user. Replace it with text that: (a) says a public gallery is coming soon IF the plugin gets popular enough, (b) briefly lists the cool stuff it'll have, and (c) asks the user to star the GitHub repo if they want it built. This makes `/ul` honest and turns a dead link into a growth lever.

## Exact copy to ship
Adapt to the existing `lines[]` push style + markdown, keep it clean:

```
### A gallery is coming
If Saulene gets popular enough, a public gallery goes live where you can:
- customize how your ul looks in your terminal
- see the oldest ul alive, and the wisest
- the average age of every ul, the rarest types, the biggest ruptures
- find your own ul on the shared wall

⭐ Want it built for real? Star the repo → https://github.com/shott038/Saulene
```

## Key files
- `packages/plugin/src/skill/index.ts` — the `format()` function's "Gallery upsell" block (~lines 82-84) and the `GALLERY_URL` constant (~line 30). Remove the saulene.app breakdown link entirely. Update the top doc comment (lines 4-13) references to "Gallery upsell for the full breakdown" / "see the gallery for those" to match the new teaser intent.
- `packages/plugin/dist/bin/skill-ul.js` — the SHIPPED bundle; must be regenerated (see below).
- `packages/plugin/test/*` — update any test asserting the old gallery-link text.

## CRITICAL — rebundle + recommit
The plugin ships pre-built bundles; the committed `dist/` is what users actually run. After editing source you MUST run `pnpm bundle` (or `pnpm --filter @saulene/plugin bundle`) to regenerate `packages/plugin/dist/bin/skill-ul.js`, and commit the regenerated bundle in the SAME commit as the source change. The `.gitignore` already keeps tsc junk (.d.ts/.map/dev bins) out, so `git status` after bundling should show only source + the regenerated tracked bundle(s). If you skip the rebundle, the change won't ship.

## Verify
- `pnpm check` stays green (boundaries + lint + typecheck + tests). Grep `test/` for `saulene.app` / `full breakdown` and update any assertion to the new teaser.
- Confirm the regenerated `dist/bin/skill-ul.js` contains the new text (grep for `A gallery is coming` / `Star the repo`) and NO longer contains `saulene.app/ul`.
- Optional: `node packages/plugin/dist/bin/skill-ul.js` (prints nothing if no ul exists — that's fine).

## Out of scope
- The reporter default (stays ON). The birth/engine. The `countdownLine()` "Restore via the Saulene token" line (leave it). Anything beyond the `/ul` gallery copy + the required rebundle.

## Verification
- Build: pass
- Tests: pass (489 passed across 25 test files)
- Scope kept: yes — only the gallery copy block + constant changed; countdown line untouched
- Summary: replaced dead saulene.app/ul/<id> link with "A gallery is coming" teaser + GitHub star CTA; bundle regenerated and committed

## Status
Status: ready-to-merge
