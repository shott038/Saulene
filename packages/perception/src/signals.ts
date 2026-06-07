/**
 * @saulene/perception — ledger → engine-ready signals
 *
 * One source of truth for the observation-list → per-aspect practice/fit conversion.
 * Previously inlined in packages/plugin/src/hooks/stop.ts; extracted here so
 * tools/life-sim can consume the same conversion without going through the plugin.
 */

import { ASPECTS } from "@saulene/core";
import type { Aspect, AspectVector } from "@saulene/core";
import type { Observation } from "./schema.js";

/** Per-aspect normalized signals ready for the engine's charge/chargeTension calls. */
export interface LedgerSignals {
  /** practice ordinal 0–3 → 0–1, averaged across task + interaction modes. */
  practice: Partial<AspectVector>;
  /** fit ordinal −3..+3 → −1..+1, averaged across task + interaction modes. */
  fit: Partial<AspectVector>;
}

/**
 * Convert a sparse observation list to per-aspect practice/fit signals.
 * Same aspect can appear in both "task" and "interaction" modes → averaged across modes.
 */
export function ledgerToSignals(observations: Observation[]): LedgerSignals {
  const practiceSums: Partial<AspectVector> = {};
  const fitSums: Partial<AspectVector> = {};
  const counts: Partial<Record<Aspect, number>> = {};

  for (const obs of observations) {
    const a = obs.aspect;
    practiceSums[a] = (practiceSums[a] ?? 0) + obs.practice / 3;
    fitSums[a] = (fitSums[a] ?? 0) + obs.fit / 3;
    counts[a] = (counts[a] ?? 0) + 1;
  }

  const practice: Partial<AspectVector> = {};
  const fit: Partial<AspectVector> = {};
  for (const a of ASPECTS) {
    const n = counts[a];
    if (n) {
      practice[a] = (practiceSums[a] ?? 0) / n;
      fit[a] = (fitSums[a] ?? 0) / n;
    }
  }

  return { practice, fit };
}
