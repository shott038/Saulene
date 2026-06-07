/**
 * @saulene/life-sim-pop — EmpiricalLedgerSource
 *
 * Implements `LedgerSource` against a fixture/real corpus of perception ledgers.
 * Deterministic: same (corpus, seed, soul, sessionIndex) → identical ScriptedSession.
 * No IO — the corpus is pre-loaded and passed in.
 *
 * The observation → practice/fit conversion is the shared pure `ledgerToSignals` from
 * @saulene/perception (one source of truth, also used by the plugin's Stop hook).
 */

import type { Soul } from "@saulene/core";
import { projectMbti, stageFromMp } from "@saulene/core";
import { ledgerToSignals } from "@saulene/perception";
import type { ScriptedSession } from "@saulene/simulator";
import { hashPair, makeRng } from "./rng.js";
import type { CorpusRecord, LedgerSource } from "./types.js";

// ── EmpiricalLedgerSource ─────────────────────────────────────────────────────

/**
 * Samples ScriptedSessions from a pre-loaded corpus of perception ledgers.
 *
 * Bucket matching priority (falls back progressively if no records found):
 *   1. persona + workType + stage + stateBucket (MBTI)
 *   2. persona + workType + stage
 *   3. persona + workType
 *   4. all records
 *
 * Each `next()` call derives a fresh RNG from `hash(seed, sessionIndex)` so the draw is
 * stateless (same inputs → same session regardless of call order) — this is what makes CRN
 * work: two lives with the same sessionIndex always draw from the same RNG point.
 */
export class EmpiricalLedgerSource implements LedgerSource {
  private readonly records: readonly CorpusRecord[];
  private readonly seed: number;

  constructor(records: readonly CorpusRecord[], seed: number) {
    if (records.length === 0) throw new Error("EmpiricalLedgerSource: corpus is empty");
    this.records = records;
    this.seed = seed;
  }

  next(
    soul: Soul,
    opts: { persona: string; workType: string; sessionIndex: number },
  ): ScriptedSession {
    const mbti = projectMbti(soul.v);
    const stage = stageFromMp(soul.mp, soul);

    const bucket = this.selectBucket(opts.persona, opts.workType, stage, mbti);
    const rng = makeRng(hashPair(this.seed, opts.sessionIndex));
    const record = bucket[rng.int(bucket.length)];
    if (!record) throw new Error("EmpiricalLedgerSource: empty bucket after selection");

    const signals = ledgerToSignals(record.ledger.observations);
    return { ...signals, significance: record.ledger.session_significance };
  }

  private selectBucket(
    persona: string,
    workType: string,
    stage: string,
    stateBucket: string,
  ): readonly CorpusRecord[] {
    const full = this.records.filter(
      (r) =>
        r.bucket.persona === persona &&
        r.bucket.workType === workType &&
        r.bucket.stage === stage &&
        r.bucket.stateBucket === stateBucket,
    );
    if (full.length > 0) return full;

    const noState = this.records.filter(
      (r) =>
        r.bucket.persona === persona && r.bucket.workType === workType && r.bucket.stage === stage,
    );
    if (noState.length > 0) return noState;

    const pairOnly = this.records.filter(
      (r) => r.bucket.persona === persona && r.bucket.workType === workType,
    );
    if (pairOnly.length > 0) return pairOnly;

    return this.records;
  }
}
