/**
 * @saulene/life-sim-pop — shared types
 *
 * The W1/W2 contract: `LedgerSource` interface, corpus record shape, and the user-script
 * union that `population()` accepts. W1 (cli-perception / life-sim) owns the real corpus
 * production; we build against this fixture-compatible definition and swap at merge.
 *
 * TODO(merge-W1): replace local `CorpusRecord` with the shared type from @saulene/life-sim
 * once W1 lands, and replace `ledgerToSignals` with the shared pure fn it extracts.
 */

import type { Soul } from "@saulene/core";
import type { Observation } from "@saulene/perception";
import type { ScriptedSession } from "@saulene/simulator";

// ── Corpus ────────────────────────────────────────────────────────────────────

export interface CorpusBucket {
  persona: string;
  workType: string;
  /** Life stage string (matches `Stage` from core). */
  stage: string;
  /** Coarse soul-state bucket: MBTI label (16 possible values). */
  stateBucket: string;
}

export interface CorpusLedger {
  observations: Observation[];
  session_significance: number;
}

export interface CorpusRecord {
  bucket: CorpusBucket;
  ledger: CorpusLedger;
  meta: { soulHash: string; model: string };
}

// ── LedgerSource ─────────────────────────────────────────────────────────────

/**
 * The shared W1/W2 contract.
 *
 * `next()` returns the ScriptedSession the ul "lived" at `sessionIndex`, given the ul's
 * current soul state and the session descriptor. Implementations must be deterministic —
 * same inputs → same ScriptedSession — so CRN holds across knob variants.
 */
export interface LedgerSource {
  next(
    soul: Soul,
    opts: { persona: string; workType: string; sessionIndex: number },
  ): ScriptedSession;
}

// ── User scripts ──────────────────────────────────────────────────────────────

/** A pre-authored session sequence (uses the existing `block`/`script` helpers). */
export interface StaticUserScript {
  name: string;
  sessions: readonly ScriptedSession[];
}

/**
 * An empirical descriptor: the population runner calls `ledgerSource.next()` at each step,
 * feeding the current soul state so the bucket adapts as the ul drifts.
 */
export interface EmpiricalUserScript {
  name: string;
  persona: string;
  workType: string;
  sessionCount: number;
}

export type UserScript = StaticUserScript | EmpiricalUserScript;

export function isStatic(s: UserScript): s is StaticUserScript {
  return "sessions" in s;
}

// ── Population results ────────────────────────────────────────────────────────

export interface LifeResult {
  seedId: number;
  scriptName: string;
  knobSetIdx: number;
  /** Final MBTI label (adult readout). */
  finalMbti: string;
  /** Number of breaking-point events in this life. */
  breakCount: number;
  /** L2 distance from birth v to final v — how much the soul drifted. */
  drift: number;
  /** MP at which the ul first reached adulthood (undefined = never reached). */
  mpAtAdulthood: number | undefined;
}

export interface AggregateMetrics {
  n: number;
  /** MBTI label → count across all adult uls. */
  adultMbtiDist: Record<string, number>;
  meanBreaksPerLife: number;
  /** Fraction of lives that had at least one breaking point. */
  breakRarity: number;
  /** Mean soul drift (L2 of final v − birth v) per script. */
  meanDriftByScript: Record<string, number>;
  /** Mean MP at first adulthood entry, per script. */
  meanMpAtAdulthoodByScript: Record<string, number>;
}

export interface PopulationResult {
  lives: LifeResult[];
  metrics: AggregateMetrics;
}

// ── Experiment results ────────────────────────────────────────────────────────

export interface CrnPairedResult {
  seedId: number;
  /** Final v under knob set A. */
  vA: Record<string, number>;
  /** Final v under knob set B. */
  vB: Record<string, number>;
  /** L2 distance between vA and vB — the per-life knob effect. */
  delta: number;
  breakCountA: number;
  breakCountB: number;
}

export interface FrozenABResult {
  seedId: number;
  /** Final v after a full drifting life. */
  vDrifting: Record<string, number>;
  /** v at birth (what a frozen ul always shows). */
  vFrozen: Record<string, number>;
  /** L2 distance — how much lived experience actually moved the ul. */
  causalDrift: number;
}

export interface LhsSample {
  seedId: number;
  scriptIdx: number;
  knobs: Record<string, number>;
}

export interface PowerAnalysisResult {
  nPerGroup: number;
  nTotal: number;
  /** The effect size δ that was supplied. */
  observedEffect: number;
  /** The variance σ² that was supplied. */
  observedVariance: number;
  alpha: number;
  targetPower: number;
}
