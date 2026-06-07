/**
 * @saulene/life-sim — LedgerSource contract
 *
 * The W2 (population sim) interface: given a soul + session context, produce the
 * practice/fit/significance signals the engine needs. Two implementations:
 *   • CorpusLedgerSource — samples empirical records from the JSONL corpus (deterministic RNG)
 *   • (W2 can also implement LedgerSource directly with scripted ledgers)
 *
 * The corpus record type is also defined here — it is what the fingerprint builder writes
 * and what CorpusLedgerSource reads.
 */

import type { Soul, Stage } from "@saulene/core";
import type { Observation } from "@saulene/perception";
import { ledgerToSignals } from "@saulene/perception";
import type { ScriptedSession } from "@saulene/simulator";
import type { Bucket, Persona, WorkType } from "./buckets.js";

// ── Corpus record ─────────────────────────────────────────────────────────────

/** One record in the fingerprint JSONL corpus. Written by the fingerprint builder. */
export interface CorpusRecord {
  bucket: Bucket;
  ledger: {
    observations: Observation[];
    sessionSignificance: number;
  };
  meta: {
    soulHash: string;
    model: string;
  };
}

// ── LedgerSource interface ────────────────────────────────────────────────────

export interface SessionContext {
  persona: Persona;
  workType: WorkType;
  /** Monotonically increasing session counter for the life — used for arc/arc-shift and stage. */
  sessionIndex: number;
}

/**
 * W2's view of a session: produce the ScriptedSession the engine needs given a soul + context.
 * Implementations may draw from the corpus (CorpusLedgerSource) or use scripted rules.
 */
export interface LedgerSource {
  next(soul: Soul, ctx: SessionContext): ScriptedSession;
}

// ── Deterministic RNG ────────────────────────────────────────────────────────

/** Injected RNG — NO Math.random allowed (determinism / reproducibility). */
export interface RngFn {
  /** Returns a float in [0, 1). */
  next(): number;
}

/**
 * Simple splitmix64-style seeded RNG satisfying RngFn.
 * Deterministic: same seed → same sequence.
 */
export class SeededRng implements RngFn {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    // xorshift32 — fast, deterministic, no Math.random
    let s = this.state;
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    this.state = s;
    // Map to [0, 1) via unsigned interpretation
    return (s >>> 0) / 0x100000000;
  }
}

// ── CorpusLedgerSource ────────────────────────────────────────────────────────

/**
 * Samples ScriptedSession ledgers from the JSONL corpus deterministically.
 * Matching: prefer records whose bucket.persona + workType match the context;
 * fall back to all records if no match exists (sparse corpus).
 * The soul's current stage is used to further narrow the match when records are available.
 */
export class CorpusLedgerSource implements LedgerSource {
  constructor(
    private readonly records: CorpusRecord[],
    private readonly rng: RngFn,
  ) {}

  next(soul: Soul, ctx: SessionContext): ScriptedSession {
    const pool = this.selectPool(soul, ctx);
    const idx = Math.floor(this.rng.next() * pool.length) % pool.length;
    const record = pool[idx] ?? pool[0];
    if (!record) throw new Error("CorpusLedgerSource: empty pool — no records to sample from");
    const { practice, fit } = ledgerToSignals(record.ledger.observations);
    return {
      practice,
      fit,
      significance: record.ledger.sessionSignificance,
    };
  }

  private selectPool(soul: Soul, ctx: SessionContext): CorpusRecord[] {
    // Narrow by persona + workType + stage
    let pool = this.records.filter(
      (r) => r.bucket.persona === ctx.persona && r.bucket.workType === ctx.workType,
    );
    if (pool.length === 0) {
      // Fall back: persona only
      pool = this.records.filter((r) => r.bucket.persona === ctx.persona);
    }
    if (pool.length === 0) {
      // Final fallback: all records
      pool = this.records;
    }
    return pool;
  }
}

// ── Corpus I/O helpers ────────────────────────────────────────────────────────

/** Parse a JSONL string into corpus records. */
export function parseCorpus(jsonl: string): CorpusRecord[] {
  return jsonl
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as CorpusRecord);
}

/** Serialize a corpus record to a JSONL line. */
export function serializeRecord(record: CorpusRecord): string {
  return JSON.stringify(record);
}
