/**
 * @saulene/life-sim-pop
 *
 * Population-scale deterministic life simulation + experiment-design toolkit.
 * Layer A of the surrogate pyramid: consumes the perception-fingerprint corpus (W1)
 * and the pure engine to run millions of lives for free, with tight CIs.
 *
 * Dev-only. No LLM, no IO, no Math.random — inject seeds, get identical results.
 */

export { EmpiricalLedgerSource } from "./empirical-source.js";
export { population } from "./population.js";
export type { PopulationOpts } from "./population.js";
export {
  crnPaired,
  frozenSoulAB,
  latinHypercube,
  powerAnalysis,
} from "./experiment.js";
export type {
  CrnPairedOpts,
  FrozenSoulABOpts,
  KnobRange,
  LatinHypercubeOpts,
  PowerAnalysisOpts,
} from "./experiment.js";
export type {
  AggregateMetrics,
  CorpusBucket,
  CorpusLedger,
  CorpusRecord,
  CrnPairedResult,
  EmpiricalUserScript,
  FrozenABResult,
  LedgerSource,
  LifeResult,
  LhsSample,
  PopulationResult,
  PowerAnalysisResult,
  StaticUserScript,
  UserScript,
} from "./types.js";
