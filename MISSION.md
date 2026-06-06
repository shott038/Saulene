# Mission: Storage (Phase 4) — soul.json + full history + the two-shelf store

**Started:** 2026-06-06
**Branch:** claude/storage
**Parent:** main @ 1c8d497

## Goal
Build `packages/storage`: filesystem persistence for the one global soul + its FULL history.
Load/save the live `Soul`, append-only history (ledger rows, diary, voice samples), and the
**two-shelf store with a hard label wall** (diary physically separate from voice-samples), plus
**retrieval-by-state-distance** for the renderer's future few-shot layer. This is the persistence
substrate the plugin and renderer Layer 2 sit on — and the first package allowed to do real IO.

**Scope of IO: the filesystem ONLY.** No LLM, no engine math, no network, no clock-dependent logic
in the core paths. `storage` imports **only `@saulene/core`** (for the `Soul` type) — it may NOT
import `perception` (boundary forbids it), so storage defines its OWN on-disk record schemas; the
plugin will bridge perception's output into them later.

## Determinism / testability (REQUIRED)
- **Inject the root path.** Never hardcode `~/.saulene`. Every function takes a `root` (base dir);
  provide a `defaultRoot()` that resolves `~/.saulene` for production, but tests pass a temp dir
  (`os.tmpdir()` + a unique subdir) and clean up. No test may touch the real home directory.
- Pure-ish: same inputs + same disk state → same result. Timestamps/IDs that must be recorded are
  **injected as arguments**, not read from `Date.now()` inside storage.

## zod enters here (Phase 0 deferred item)
Add `zod` as a dependency. Every file read from disk is an **untrusted boundary** (hand-edited,
version-skewed, partially-written). Define zod schemas for `soul.json` and each history record;
**validate on load and FAIL LOUD** (throw a clear typed error) rather than silently loading a
malformed soul. Stamp a `schemaVersion` in each persisted file. Add the `zod` note/checkbox in
`BUILD_GUIDE.md` Phase 0 as done.

## What to build (`packages/storage/src/`)
1. **Soul persistence** — `loadSoul(root) → Soul` (zod-validated, throws on malformed/missing-vs-absent
   distinction: a missing file is a clean "no soul yet", a malformed file is a loud error) and
   `saveSoul(root, soul)` → writes `<root>/soul.json` atomically (write-temp-then-rename so a crash
   mid-write can't corrupt the soul). The Soul type is from `@saulene/core`.
2. **Full history (append-only)** — retain EVERYTHING, not just live state (the paid fine-tune/LoRA
   "max" upgrade + lifetime replay depend on it). `appendLedger(root, entry)`, `appendDiary(root, entry)`,
   `appendVoiceSample(root, sample)` — append to per-shelf logs (e.g. JSONL). Define the record types +
   zod schemas in storage (sparse ledger row: aspect/mode/practice/fit/confidence/evidence_quote/
   first_person_note/salience + session id/timestamp passed in — mirror SPEC §"Diary + ... Ledger"
   shape but as STORAGE's own persisted type, not a perception import).
3. **Two-shelf store + hard label wall** — diary (memory/CONTENT) and voice-samples (form/IMITATION)
   live in **physically separate files/dirs**, never interleaved at rest. This is load-bearing against
   register-bleed; they're only recombined at inject time (by the renderer/plugin, not here). Make the
   separation structural, not just a field.
4. **Retrieval by state-distance** — each voice sample is tagged with the `Soul` state (or its aspect
   vector) at capture. `nearestVoiceSamples(root, queryState, k) → samples[]` returns the k whose
   tagged state is nearest the query (for Layer-2 few-shot). Use a simple, documented distance
   (e.g. L2 over the 10 aspects). Pure ranking over the loaded shelf.
5. **Capture guardrails (SPEC Layer-2 critics):**
   - **Quality-gate capture** — a hook/param so junk isn't appended (corpus must not become
     self-amplifying sludge). A simple predicate is fine; make the gate a seam, not hardcoded.
   - **Provenance-weight** — tag each voice sample with model/version provenance so old-model samples
     can be down-weighted later (store the field; the down-weighting itself is the renderer's job).

## Out of scope
- Any LLM, perception logic, or engine math. No `perception` import (boundary). Renderer's inject-time
  recombination + the actual few-shot prompt assembly (that's renderer Layer 2, later).
- The setup wizard, hooks, MCP (that's `plugin`). The neglect-death clock logic (engine/plugin).
- `core` changes. The `viz-exploration` sprite code.

## Proof (deterministic vitest, all against a temp root)
- **Round-trip:** `saveSoul` then `loadSoul` returns an equal Soul. A soul minted by `seedFromEntropy`
  survives a round-trip byte-for-byte.
- **Atomic write:** a save leaves no partial file; (simulate/assert temp-then-rename — at least that a
  failed/partial write doesn't clobber a previously-good soul.json).
- **Malformed = loud:** a hand-corrupted soul.json throws a clear zod error; a *missing* file is a
  distinct clean "no soul" signal (not the same as malformed).
- **Append + history:** appended ledger/diary/voice rows read back in order; full history is retained.
- **Label wall:** diary and voice-samples are in separate files; nothing writes diary content into the
  voice shelf or vice-versa (assert the physical separation).
- **Retrieval:** `nearestVoiceSamples` returns the k closest by state-distance, nearest first.
- **Provenance + quality gate:** samples carry provenance; the quality gate can reject an entry.

## Done
`pnpm check` green (boundaries + lint + typecheck + tests), and `BUILD_GUIDE.md` updated IN THE SAME
COMMIT: check off the `storage` Phase 4 item + the Phase 0 `zod` item. Add a `## Verification` block
to THIS MISSION.md before marking ready (`Build: pass`, `Tests: pass`, `Scope kept: yes`).

Source of truth: `SPEC.md` §"Where it lives" (~234), §"Two-shelf store" (~473), §"Diary + Evidence-
Cited Sparse Ledger" (~611–648) for the record shape, §Storage-format open question (~883);
`docs/ARCHITECTURE.md` (storage imports only core; filesystem IO only).

## Verification
- Build: pass (`pnpm typecheck` / `tsc -b` clean)
- Tests: pass (107 passed — 19 new in `packages/storage/test/storage.test.ts`, all against a temp root)
- Scope kept: yes (filesystem IO only; imports only `@saulene/core`; own on-disk zod schemas; no
  `perception` import; injected `root`, no `Date.now()` in core paths)
- Summary: `packages/storage` — atomic+fail-loud `soul.json`, append-only ledger/diary/voice JSONL,
  two-shelf physical label wall, `nearestVoiceSamples` (L2), quality-gate + provenance seams; adds zod.

Full `pnpm check` green: boundaries + lint + typecheck + tests.

## Key files
- `packages/storage/src/schemas.ts` — zod on-disk schemas (soul + ledger/diary/voice records), `schemaVersion`, `StorageError`
- `packages/storage/src/paths.ts` — injected `root` + per-shelf paths (the label wall)
- `packages/storage/src/soul.ts` — `saveSoul` (atomic) / `loadSoul` (fail-loud, missing≠malformed)
- `packages/storage/src/history.ts` — append-only shelves + quality-gate seam
- `packages/storage/src/retrieval.ts` — `aspectDistance` (L2) + `nearestVoiceSamples`
- `packages/storage/test/storage.test.ts` — 19 tests, all vs a temp dir

## Status
Status: ready-to-merge
