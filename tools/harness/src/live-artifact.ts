/**
 * @saulene/harness — the on-disk live-run artifact shape (no side effects).
 *
 * Split out from `live.ts` (which runs `main()` at module load) so `calibrate.ts` can import the
 * path + type WITHOUT triggering a live run on import.
 */

import type { HarnessReport } from "./index.js";

/** Where the raw live run lands. Written by `live.ts`, read by `calibrate.ts`. Gitignored. */
export const LIVE_RUN_PATH = ".live-run.json";

/** The full live artifact written to disk by the live run. */
export interface LiveRunArtifact {
  generatedAt: string;
  model: string;
  rendererVersion: string;
  seeds: readonly number[];
  modelCalls: number;
  cacheHits: number;
  report: HarnessReport;
  /**
   * Leak-free voice-distinctness signal (see FINDINGS): pairwise embedding distance between the N
   * souls' injections. With a prompt-INDEPENDENT renderer the formal cross-soul matrix is
   * degenerate (a sample equals its own reference), so this is the honest stand-in until a
   * generation step exists.
   */
  voiceSeparation: { meanPairwise: number; minPairwise: number; maxPairwise: number };
}
