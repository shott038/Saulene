/**
 * @saulene/storage — on-disk schemas (the untrusted-boundary contract)
 *
 * Every file read from disk is hand-editable, version-skewed, or possibly written
 * by a crashed process — i.e. UNTRUSTED. These zod schemas are the gate: we validate
 * on load and FAIL LOUD (throw `StorageError`) rather than silently loading a
 * malformed soul. Each persisted file/record stamps `schemaVersion` so a future
 * format change is detectable, not a silent mis-parse.
 *
 * These are STORAGE's OWN persisted types. Storage may import only `@saulene/core`
 * (for the live `Soul` type + the canonical `ASPECTS`); it must NOT import
 * `perception` (boundary). The ledger row mirrors the SPEC sparse-ledger SHAPE, but
 * as storage's own on-disk record — the plugin bridges perception's output into it.
 */

import { ASPECTS, type Aspect, type Soul } from "@saulene/core";
import { z } from "zod";

/** Bumped whenever any on-disk shape changes. Stamped into every persisted file/record. */
export const STORAGE_SCHEMA_VERSION = 1 as const;

/** A typed error for every loud failure on the disk boundary (bad JSON, failed validation). */
export class StorageError extends Error {
  override readonly name = "StorageError";
  /** The underlying cause (a `ZodError`, a JSON `SyntaxError`, an fs error, …). */
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    if (details !== undefined) this.details = details;
  }
}

// ── aspect-vector schemas ─────────────────────────────────────────────────────
// Built from the canonical ASPECTS tuple so the on-disk shape can never drift from
// core's truth: every one of the 10 aspects must be present, and nothing else.

const finite = z.number().finite();
/** A value constrained to [0,1] — for v / s / disuseAnchor and captured states. */
const unit = finite.min(0).max(1);

const aspectShape = (value: z.ZodNumber): Record<Aspect, z.ZodNumber> =>
  Object.fromEntries(ASPECTS.map((a) => [a, value])) as Record<Aspect, z.ZodNumber>;

/** Aspect vector whose every value is in [0,1] (dispositions / set points). */
export const AspectVector01 = z.object(aspectShape(unit));
/** Aspect vector of arbitrary finite numbers (accumulators, tension, refractory, gains). */
export const AspectVectorNum = z.object(aspectShape(finite));

// ── soul.json ─────────────────────────────────────────────────────────────────
// A faithful validator for the core `Soul`. Bounds match `seedFromEntropy`'s
// invariants (v/s/disuseAnchor clamped to [0,1]); the dynamical fields are merely
// required finite numbers — we reject missing/wrong-typed fields, not valid extremes.

export const SoulSchema = z.object({
  v: AspectVector01,
  s: AspectVector01,
  a: AspectVectorNum,
  tension: AspectVectorNum,
  disuseAnchor: AspectVector01,
  refractory: AspectVectorNum,
  betaGain: AspectVectorNum,
  migrationBudget: finite,
  stubbornness: unit,
  sex: z.enum(["male", "female"]),
  mp: finite,
  lastUsedAt: finite,
});

/** The on-disk soul file: the validated soul plus a format stamp. */
export const SoulFileSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  soul: SoulSchema,
});

export type SoulFile = z.infer<typeof SoulFileSchema>;

// Compile-time guard: storage's persisted soul must stay assignable to core's Soul.
// If core's Soul gains a field, this line stops compiling until the schema catches up.
type _SchemaMatchesSoul = z.infer<typeof SoulSchema> extends Soul
  ? Soul extends z.infer<typeof SoulSchema>
    ? true
    : never
  : never;
const _schemaMatchesSoul: _SchemaMatchesSoul = true;
void _schemaMatchesSoul;

// ── history records (append-only) ──────────────────────────────────────────────
// Three physically separate shelves. The label wall lives in `paths.ts` + `history.ts`
// (separate files), but the TYPES are distinct here too: a diary entry and a voice
// sample are not interchangeable, so a mis-routed write fails validation as well.

const aspectEnum = z.enum([...ASPECTS] as [Aspect, ...Aspect[]]);

/**
 * One sparse ledger row — an aspect genuinely exercised in a session. Mirrors the SPEC
 * "Evidence-Cited Sparse Ledger" shape (practice ⊥ fit, evidence-quoted), as storage's
 * own on-disk record. `sessionId` + `timestamp` are injected by the caller (never read
 * from a clock here); `schemaVersion` is stamped on append.
 */
export const LedgerRowSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  sessionId: z.string(),
  timestamp: finite,
  aspect: aspectEnum,
  /** `task` vs `interaction` — two channels, so emotional aspects aren't swallowed by work. */
  mode: z.enum(["task", "interaction"]),
  /** How much the aspect was exercised (anchored ordinal 0–3). */
  practice: z.number().int().min(0).max(3),
  /** How it landed for the ul (signed −3..+3) — orthogonal to practice. */
  fit: z.number().int().min(-3).max(3),
  confidence: z.enum(["low", "med", "high"]),
  /** Verbatim transcript span (the anti-hallucination anchor). */
  evidenceQuote: z.string(),
  /** Short first-person gloss (the ul's own experience). */
  firstPersonNote: z.string(),
  /** How formative, 0–3 (no hard cap on row count). */
  salience: z.number().int().min(0).max(3),
});

/** A short first-person diary entry — memory/CONTENT shelf. The engine ignores it. */
export const DiaryEntrySchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  sessionId: z.string(),
  timestamp: finite,
  text: z.string(),
});

/** Model/version provenance, so old-model samples can be down-weighted later (renderer's job). */
export const ProvenanceSchema = z.object({
  model: z.string(),
  version: z.string(),
});

/**
 * One captured voice sample — form/IMITATION shelf. Tagged with the `Soul` aspect state
 * at capture so the renderer's Layer-2 few-shot can retrieve by state-distance, and with
 * provenance for later down-weighting. Physically separate from the diary at rest.
 */
export const VoiceSampleSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  sessionId: z.string(),
  timestamp: finite,
  /** The actual sample of the ul's voice (a span of its own output). */
  text: z.string(),
  /** The soul's aspect vector at capture — the retrieval key. */
  state: AspectVector01,
  provenance: ProvenanceSchema,
});

export type LedgerRow = z.infer<typeof LedgerRowSchema>;
export type DiaryEntry = z.infer<typeof DiaryEntrySchema>;
export type VoiceSample = z.infer<typeof VoiceSampleSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;

/** Caller-supplied records — storage stamps `schemaVersion` on append. */
export type LedgerRowInput = Omit<LedgerRow, "schemaVersion">;
export type DiaryEntryInput = Omit<DiaryEntry, "schemaVersion">;
export type VoiceSampleInput = Omit<VoiceSample, "schemaVersion">;
