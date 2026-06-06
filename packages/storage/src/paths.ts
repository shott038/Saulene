/**
 * @saulene/storage — on-disk layout (the injected-root contract + the label wall)
 *
 * NOTHING here hardcodes `~/.saulene`. Every storage function takes a `root`; production
 * resolves it via `defaultRoot()`, tests pass a temp dir. No storage code may touch the
 * real home directory except through `defaultRoot()` — which tests never call.
 *
 * The label wall is STRUCTURAL: the diary (memory/CONTENT) and voice samples
 * (form/IMITATION) live under physically separate subdirectories and can never be
 * interleaved at rest. They are recombined only at inject time — by the renderer/plugin,
 * never here.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve the production root (`~/.saulene`). PRODUCTION ONLY — tests must pass their own
 * temp root and never call this, so no test can touch the real home directory.
 */
export function defaultRoot(): string {
  return join(homedir(), ".saulene");
}

/** The live soul: `<root>/soul.json`. */
export const soulPath = (root: string): string => join(root, "soul.json");

/** The sparse practice/fit ledger (append-only): `<root>/history/ledger.jsonl`. */
export const ledgerPath = (root: string): string => join(root, "history", "ledger.jsonl");

/**
 * Diary shelf — memory/CONTENT. Its OWN subdirectory: `<root>/history/diary/diary.jsonl`.
 * The separate dir is the label wall; nothing voice-shaped is ever written under it.
 */
export const diaryPath = (root: string): string => join(root, "history", "diary", "diary.jsonl");

/**
 * Voice shelf — form/IMITATION. Its OWN subdirectory:
 * `<root>/history/voice/voice-samples.jsonl`. Physically walled off from the diary.
 */
export const voicePath = (root: string): string =>
  join(root, "history", "voice", "voice-samples.jsonl");
