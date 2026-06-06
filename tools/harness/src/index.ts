/**
 * @saulene/harness
 *
 * The verification harness — the uncontested piece; it's how every expression layer gets tuned.
 * Five metrics over replayed synthetic lifetimes, scored through an injected renderer + judge:
 *   1. Trait-recovery / anti-sticker detector (core metric)
 *   2. Cross-soul confusion matrix
 *   3. Longitudinal trajectory (perceptible net drift, continuous step-to-step)
 *   4. Stage silhouette
 *   5. Per-aspect ablation sensitivity
 *
 * DECOUPLED BY DESIGN: the harness never imports the renderer's concrete `render`. It is
 * parameterized over a locally-pinned `RenderFn` (see `./render`) and a fakeable `Judge` port
 * (see `./judge`), so it compiles + tests green while the renderer is still a stub. The real
 * renderer + LLM judge wire in unchanged at the Phase 3 tuning step.
 *
 * Dev-only.
 */

import { type Soul, seedFromEntropy } from "@saulene/core";
import { type ScriptedSession, block, entropyFromInt, lifetime, script } from "@saulene/simulator";
import { PROMPT_BATTERY, type PromptBattery } from "./battery.js";
import type { Judge } from "./judge.js";
import {
  type AblationResult,
  type CrossSoulResult,
  type StageSilhouetteResult,
  type TraitRecoveryResult,
  type TrajectoryResult,
  ablation,
  crossSoulConfusion,
  stageSilhouette,
  traitRecovery,
  trajectory,
} from "./metrics.js";
import type { RenderFn } from "./render.js";

export type { RenderFn, RenderedInjection } from "./render.js";
export {
  type Judge,
  fakeJudge,
  realJudge,
  type RealJudgeOpts,
  JUDGE_DIMENSIONS,
  EMBED_AXES,
  BASELINE,
  encodeInjectionText,
} from "./judge.js";
export {
  AnthropicJudgeClient,
  type AnthropicJudgeClientOpts,
  DEFAULT_JUDGE_MODEL,
} from "./llm.js";
export { type PromptBattery, PROMPT_BATTERY } from "./battery.js";
export {
  // metric fns
  traitRecovery,
  crossSoulConfusion,
  trajectory,
  stageSilhouette,
  ablation,
  // metric result types
  type TraitRecoveryResult,
  type CrossSoulResult,
  type TrajectoryResult,
  type StageSilhouetteResult,
  type AspectSensitivity,
  type AblationResult,
  // tunable thresholds
  STICKER_EPS,
  DIAGONAL_THRESHOLD,
  PERCEPTIBILITY,
  JERK,
  SILHOUETTE_THRESHOLD,
  FLAT_EPS,
} from "./metrics.js";

/** Options for `runHarness` — every field has a deterministic default. */
export interface HarnessOptions {
  /** How many distinct souls to mint for the cross-soul matrix. Default 4. */
  soulCount?: number;
  /** Integer seeds for the souls (→ `entropyFromInt`). Default `[1..soulCount]`. */
  seeds?: readonly number[];
  /**
   * The scripted lifetime fed to the simulator for the trajectory + stage metrics. Default is a
   * smooth aligned life long enough to span all four stages without rupturing (positive fit ⇒ no
   * breaks ⇒ continuous drift — exactly what the trajectory metric should see pass).
   */
  lifetimeScript?: readonly ScriptedSession[];
  /** The fixed versioned prompt battery (stamped into the report). Default `PROMPT_BATTERY`. */
  battery?: PromptBattery;
}

/** The aggregate report from one full harness run — every metric's result + run provenance. */
export interface HarnessReport {
  battery: PromptBattery;
  seeds: readonly number[];
  traitRecovery: TraitRecoveryResult[];
  crossSoul: CrossSoulResult;
  trajectory: TrajectoryResult;
  stageSilhouette: StageSilhouetteResult;
  ablation: AblationResult;
}

/**
 * A smooth, aligned default life: high-practice / positive-fit on Openness + Intellect, long enough
 * (significance 0.5 ⇒ ~2 MP/session × 300 sessions ⇒ ~600 MP) to cross all four stage bands
 * (100 / 250 / 500) without ever rupturing — so drift is perceptible AND continuous.
 */
function defaultLifetimeScript(): ScriptedSession[] {
  return script(
    block({
      aspects: ["openness", "intellect"],
      practice: 0.8,
      fit: 0.6,
      significance: 0.5,
      count: 300,
    }),
  );
}

/**
 * Run all five metrics against an injected renderer + judge and return the aggregate report.
 * Deterministic: fixed seeds + a deterministic judge ⇒ identical output across runs.
 */
export async function runHarness(
  render: RenderFn,
  judge: Judge,
  opts: HarnessOptions = {},
): Promise<HarnessReport> {
  const soulCount = opts.soulCount ?? 4;
  const seeds = opts.seeds ?? Array.from({ length: soulCount }, (_, i) => i + 1);
  const battery = opts.battery ?? PROMPT_BATTERY;
  const lifeScript = opts.lifetimeScript ?? defaultLifetimeScript();

  // Mint the souls (fixed entropy → byte-identical souls every run).
  const souls: Soul[] = seeds.map((n) => seedFromEntropy(entropyFromInt(n), 0));

  // One replayed lifetime drives the trajectory + stage-silhouette metrics.
  const traj = lifetime(entropyFromInt(seeds[0] ?? 1), lifeScript);

  const recovery = await Promise.all(souls.map((s) => traitRecovery(s, render, judge)));
  const crossSoul = await crossSoulConfusion(souls, render, judge, {
    trialsPerSoul: battery.prompts.length,
  });
  const traj3 = await trajectory(traj, render, judge);
  const silhouette = await stageSilhouette(traj, render, judge);
  const ablation5 = await ablation(souls[0] as Soul, render, judge);

  return {
    battery,
    seeds,
    traitRecovery: recovery,
    crossSoul,
    trajectory: traj3,
    stageSilhouette: silhouette,
    ablation: ablation5,
  };
}
