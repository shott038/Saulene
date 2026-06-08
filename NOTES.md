# The terminal ul sprite — design notes

The ul's visual identity: a pixel-art **cloud-spirit** that lives in the user's terminal/statusline,
drawn as truecolor half-blocks. The Jun 5–6 viz-exploration prototypes (web HTML pages + scratch
`scripts/ul-*.mjs` generators) have been removed — the real implementation is the runtime below.
This file is the design reference for what that runtime does.

> ⚠️ **CANONICAL SPRITE — read before touching the look.** The REAL ul is the **pixel-art
> cloud-spirit** (truecolor half-blocks: grey outline + white fill + black eyes on dark; all-cyan on
> light). The old smooth/SVG-ish **purple "blob"** variations were scratch — **NOT canonical, never
> ship or revive them.** A purple blob instead of the pixel cloud-spirit is a regression.

## Where it lives now (the runtime — source of truth)
- `packages/renderer/src/sprite/` — pure `Soul → SpriteParams` (colors/form from the 10 aspects +
  stage + birth jitter). Golden-tested, imports only `core`.
- `packages/plugin/src/statusline/`
  - `sprite-data.ts` — the locked pixel bodies (BODY / BODY_SUCCESS / BODY_CTXHIGH / BODY_OPEN), eyes,
    the 8 idle wisp variants, breathing.
  - `rasterizer.ts` — `SpriteParams` → truecolor half-block pixel grid → ANSI.
  - `director.ts` — the conflict-resolution engine (modes + pulses).
  - `birth.ts` — the watch-only birth animation.
  - `statusline.ts` — the runtime loop + `signal()` surface driven by real Claude Code hooks.

## Geometry source of truth (kept)
- `scripts/ul-geometry.mjs` — the canonical geometry (puffs, eyes, ink/body).
- `docs/ul-default.svg` — the rendered default look.

## Animation catalog (all in the runtime director)
**Idle:** breathing (body bobs, wisps stay), random gestures (blink, double-blink, look L/R, sway L/R),
and a wisp-variant swap on a ~2:15 roll across the 8 variants; 0.25% twinkle easter-egg.

**Reactive (driven by session events):**
- Context window filling — drops down, eyes off, top opens (`BODY_OPEN`), then closes.
- Context >80% — "full" body (`BODY_CTXHIGH`); idle still plays, variant swap off.
- Prompt submit — quick 1px hop (body up, wisps down), snap back.
- Thinking — wisps slide into the body and vanish, then slide back out.
- Big success — up into the white-cap "happy" sprite (`BODY_SUCCESS`), settle back.
- Error — fast L→R→L jerk, wisps blank during the shake.
- Retry — wisps vanish then reappear, once per retry.
- Response finished — wisps push out 1px both sides, then back.
- Compaction — EXCLUSIVE scan (eyes drop, L·mid·R·mid), suspends everything else.

`compose()` overlay flags: `dx, dy, blink, eye(+eyeDy), wdy, win, open(1|2), ctx, success, noWisps`.

## Director rules (conflict resolution)
All animations share the same channels (body shape · dx/dy · eyes · wisps), so the director arbitrates:
- **MODES** (sustained, exactly one, high→low): compaction > context-filling > thinking > ctx>80% rest > idle
- **PULSES** (one-shot, preempt by priority): error > success > prompt > retry > response

Rules: (1) compaction is EXCLUSIVE — suspends idle loop, pulses, gestures, swap, breathing until done;
(2) one mode at a time (filling beats thinking while context climbs; revert after); (3) pulses preempt
by priority, play to completion, then hand back to the mode; (4) idle gestures + the 2:15 swap only run
at rest (idle / >80%); (5) >80% governs only the resting body — transient states use their own body
then settle back.

A full-lifecycle recording of the director resolving every overlap is in `docs/ul-session.gif`
(plus the per-state GIFs `docs/ul-{idle,prompt,thinking,success,error,retry,response,ctx,ctxhigh,compaction,twinkle}.gif`).
