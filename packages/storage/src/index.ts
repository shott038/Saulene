/**
 * @saulene/storage — public surface
 *
 * Filesystem persistence for the one global soul at `<root>/soul.json`, plus its FULL
 * history (every session's ledger, diary, and voice samples) — not just live state, so the
 * paid fine-tune/LoRA "max" upgrade and lifetime replay stay possible.
 *
 * Two-shelf store with a hard label wall: the diary (memory/CONTENT) is physically separate
 * from voice-samples (form/IMITATION) at rest; they are recombined only at inject time by
 * the renderer/plugin. Voice samples are tagged with the soul state at capture so Layer-2
 * few-shot can retrieve by state-distance.
 *
 * IO is the filesystem ONLY — no LLM, no engine math, no network, no clock. Every function
 * takes an injected `root`; timestamps/IDs are passed in, never read from `Date.now()`.
 * Storage imports only `@saulene/core` and defines its OWN on-disk zod schemas.
 */

// On-disk schemas, record types, and the loud-failure error.
export {
  AspectVector01,
  AspectVectorNum,
  type DiaryEntry,
  DiaryEntrySchema,
  type DiaryEntryInput,
  type LedgerRow,
  LedgerRowSchema,
  type LedgerRowInput,
  type Provenance,
  ProvenanceSchema,
  type SoulFile,
  SoulFileSchema,
  SoulSchema,
  STORAGE_SCHEMA_VERSION,
  StorageError,
  type VoiceSample,
  VoiceSampleSchema,
  type VoiceSampleInput,
} from "./schemas.js";

// On-disk layout: the injected root + per-shelf paths (the label wall).
export { defaultRoot, diaryPath, ledgerPath, soulPath, voicePath } from "./paths.js";

// Soul persistence: atomic save, fail-loud load (missing ≠ malformed).
export { loadSoul, saveSoul } from "./soul.js";

// Append-only history + the two-shelf store + the quality-gate seam.
export {
  appendDiary,
  appendLedger,
  appendVoiceSample,
  defaultQualityGate,
  type QualityGate,
  readDiary,
  readLedger,
  readVoiceSamples,
} from "./history.js";

// Retrieval by state-distance (the Layer-2 few-shot key).
export { aspectDistance, nearestVoiceSamples } from "./retrieval.js";
