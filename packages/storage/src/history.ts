/**
 * @saulene/storage — append-only history (the two-shelf store + the label wall)
 *
 * Retain EVERYTHING, not just live state: the paid fine-tune/LoRA "max" upgrade and
 * lifetime replay both depend on the full record. Each shelf is an append-only JSONL log
 * in its own file (see `paths.ts`):
 *   - ledger  → history/ledger.jsonl
 *   - diary   → history/diary/diary.jsonl        (memory / CONTENT)
 *   - voice   → history/voice/voice-samples.jsonl (form / IMITATION)
 *
 * The label wall is physical: diary and voice live under separate subdirectories and are
 * never interleaved at rest. Each append also validates against the shelf's OWN schema, so
 * a mis-routed write fails loudly rather than polluting the wrong shelf. `schemaVersion` is
 * stamped here; `sessionId`/`timestamp` are injected by the caller (no clock reads here).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { z } from "zod";
import { diaryPath, ledgerPath, voicePath } from "./paths.js";
import {
  type DiaryEntry,
  type DiaryEntryInput,
  DiaryEntrySchema,
  type LedgerRow,
  type LedgerRowInput,
  LedgerRowSchema,
  STORAGE_SCHEMA_VERSION,
  StorageError,
  type VoiceSample,
  type VoiceSampleInput,
  VoiceSampleSchema,
} from "./schemas.js";

/** Validate a record against its shelf schema, then append one JSONL line atomically-enough. */
function appendLine<T extends z.ZodTypeAny>(file: string, schema: T, record: unknown): void {
  const parsed = schema.parse(record); // throws ZodError if the record is wrong for this shelf
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(parsed)}\n`, "utf8");
}

/** Read a JSONL shelf back in append order, validating every line (untrusted boundary). */
function readShelf<T extends z.ZodTypeAny>(file: string, schema: T): Array<z.infer<T>> {
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8");
  const out: Array<z.infer<T>> = [];
  let lineNo = 0;
  for (const line of raw.split("\n")) {
    lineNo++;
    if (line.trim() === "") continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (err) {
      throw new StorageError(`${file}:${lineNo} is not valid JSON`, err);
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      throw new StorageError(`${file}:${lineNo} failed schema validation`, result.error);
    }
    out.push(result.data);
  }
  return out;
}

// ── ledger ─────────────────────────────────────────────────────────────────────

/** Append one sparse ledger row. Caller supplies everything but `schemaVersion`. */
export function appendLedger(root: string, entry: LedgerRowInput): void {
  appendLine(ledgerPath(root), LedgerRowSchema, {
    ...entry,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
}

/** Read the full ledger history in append order. */
export function readLedger(root: string): LedgerRow[] {
  return readShelf(ledgerPath(root), LedgerRowSchema);
}

// ── diary shelf (memory / CONTENT) ───────────────────────────────────────────────

/** Append one first-person diary entry to the CONTENT shelf. */
export function appendDiary(root: string, entry: DiaryEntryInput): void {
  appendLine(diaryPath(root), DiaryEntrySchema, {
    ...entry,
    schemaVersion: STORAGE_SCHEMA_VERSION,
  });
}

/** Read the full diary history in append order. */
export function readDiary(root: string): DiaryEntry[] {
  return readShelf(diaryPath(root), DiaryEntrySchema);
}

// ── voice shelf (form / IMITATION) ───────────────────────────────────────────────

/**
 * Quality gate — a SEAM, not a hardcoded rule. The corpus must not become self-amplifying
 * sludge, so junk samples are rejected before they touch disk. Swap in any predicate; the
 * default only rejects empty/whitespace text.
 */
export type QualityGate = (sample: VoiceSample) => boolean;

/** The default gate: reject empty-text samples. Replace via `appendVoiceSample`'s `gate` opt. */
export const defaultQualityGate: QualityGate = (sample) => sample.text.trim().length > 0;

/**
 * Append one voice sample to the IMITATION shelf, subject to a quality gate.
 * @returns `true` if appended, `false` if the gate rejected it (NOT written).
 */
export function appendVoiceSample(
  root: string,
  sample: VoiceSampleInput,
  opts: { gate?: QualityGate } = {},
): boolean {
  const stamped: VoiceSample = { ...sample, schemaVersion: STORAGE_SCHEMA_VERSION };
  const gate = opts.gate ?? defaultQualityGate;
  if (!gate(stamped)) return false; // junk rejected — corpus stays clean
  appendLine(voicePath(root), VoiceSampleSchema, stamped);
  return true;
}

/** Read the full voice-sample history in append order. */
export function readVoiceSamples(root: string): VoiceSample[] {
  return readShelf(voicePath(root), VoiceSampleSchema);
}
