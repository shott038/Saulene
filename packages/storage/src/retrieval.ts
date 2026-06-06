/**
 * @saulene/storage — retrieval by state-distance (the Layer-2 few-shot key)
 *
 * Each voice sample is tagged with the `Soul` aspect state at capture. To assemble the
 * renderer's future few-shot block we want the samples captured when the ul was MOST LIKE
 * it is now — so we rank the voice shelf by distance between each sample's tagged state and
 * a query state, nearest first.
 *
 * Distance = plain L2 (Euclidean) over the 10 aspect floats. Simple, documented, and
 * symmetric; the renderer can layer recency-decay / provenance down-weighting on top later
 * (this is pure ranking over the loaded shelf — no IO beyond reading it, no model calls).
 */

import { ASPECTS, type AspectVector } from "@saulene/core";
import { readVoiceSamples } from "./history.js";
import type { VoiceSample } from "./schemas.js";

/** L2 (Euclidean) distance between two aspect vectors over the 10 aspects. */
export function aspectDistance(x: AspectVector, y: AspectVector): number {
  let sum = 0;
  for (const a of ASPECTS) {
    const d = x[a] - y[a];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * The `k` voice samples whose captured state is nearest `queryState`, nearest first.
 * Pure ranking over the loaded voice shelf. Ties keep append order (stable sort). `k <= 0`
 * yields `[]`; `k` larger than the shelf yields the whole shelf, sorted.
 */
export function nearestVoiceSamples(
  root: string,
  queryState: AspectVector,
  k: number,
): VoiceSample[] {
  if (k <= 0) return [];
  return readVoiceSamples(root)
    .map((sample) => ({ sample, d: aspectDistance(sample.state, queryState) }))
    .sort((p, q) => p.d - q.d) // V8 Array.sort is stable → ties preserve append order
    .slice(0, k)
    .map(({ sample }) => sample);
}
