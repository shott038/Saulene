/**
 * @saulene/life-sim-pop — population runner
 *
 * `population()` fans out N seeds × M user-life-scripts × K knob-sets through the
 * pure engine. Static scripts use `lifetime()` directly; empirical scripts drive a
 * step-by-step loop calling `ledgerSource.next()` at each step so the bucket adapts
 * as the soul drifts. No LLM, no IO, fully deterministic.
 *
 * Records aggregate metrics: adult-MBTI distribution, break rarity, per-script drift
 * divergence, and stage-timing (MP at first adulthood entry).
 */

import {
  ASPECTS,
  type GlobalKnobs,
  type Soul,
  type Stage,
  accrueMp,
  charge,
  chargeTension,
  consolidate,
  projectMbti,
  seedFromEntropy,
  stageFromMp,
  stageRules,
} from "@saulene/core";
import type { Aspect, AspectVector } from "@saulene/core";
import {
  type BreakEvent,
  type ScriptedSession,
  type Trajectory,
  type TrajectorySnapshot,
  entropyFromInt,
  lifetime,
} from "@saulene/simulator";
import type {
  AggregateMetrics,
  EmpiricalUserScript,
  LedgerSource,
  LifeResult,
  PopulationResult,
  UserScript,
} from "./types.js";
import { isStatic } from "./types.js";

export interface PopulationOpts {
  /** Integer seeds — each becomes 8-byte entropy via `entropyFromInt`. */
  seeds: readonly number[];
  userScripts: readonly UserScript[];
  /** One or more knob sets to sweep. Index is recorded in each `LifeResult`. */
  knobSets: readonly GlobalKnobs[];
  /** Required when any `userScript` is an `EmpiricalUserScript`. */
  ledgerSource?: LedgerSource;
}

/** Run one empirical script step-by-step, calling ledgerSource.next() per session. */
function empiricalLifetime(
  seed: Uint8Array,
  script: EmpiricalUserScript,
  ledgerSource: LedgerSource,
  knobs: GlobalKnobs,
): Trajectory {
  const birth = seedFromEntropy(seed, 0);
  let soul = birth;
  const snapshots: TrajectorySnapshot[] = [];
  const breaks: BreakEvent[] = [];

  for (let i = 0; i < script.sessionCount; i++) {
    const sess = ledgerSource.next(soul, {
      persona: script.persona,
      workType: script.workType,
      sessionIndex: i,
    });

    soul = charge(soul, sess.practice, knobs);
    soul = chargeTension(soul, { practice: sess.practice, fit: sess.fit }, knobs);
    soul = { ...soul, mp: accrueMp(soul, sess.significance) };
    const stage: Stage = stageFromMp(soul.mp, soul);

    const breakThreshold = knobs.theta / stageRules(stage).plasticity;
    const priming = ASPECTS.filter(
      (a) => soul.tension[a] > breakThreshold && soul.refractory[a] === 0,
    );
    const pre = soul;

    soul = consolidate(soul, knobs, stage);

    for (const aspect of priming) {
      breaks.push({
        session: i,
        aspect,
        stage,
        tensionAtBreak: pre.tension[aspect],
        vBefore: pre.v[aspect],
        vAfter: soul.v[aspect],
        sBefore: pre.s[aspect],
        sAfter: soul.s[aspect],
      });
    }

    snapshots.push({ session: i, mp: soul.mp, stage, v: { ...soul.v }, mbti: projectMbti(soul.v) });
  }

  return { birth, final: soul, snapshots, breaks };
}

/** L2 distance between two aspect vectors. */
function l2Drift(a: AspectVector, b: AspectVector): number {
  let sum = 0;
  for (const asp of ASPECTS) {
    const d = a[asp] - b[asp];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** MP at the first snapshot where the ul entered early_adulthood, or undefined. */
function mpAtAdulthood(traj: Trajectory): number | undefined {
  for (const snap of traj.snapshots) {
    if (snap.stage === "early_adulthood") return snap.mp;
  }
  return undefined;
}

export function population(opts: PopulationOpts): PopulationResult {
  const lives: LifeResult[] = [];

  for (const seedId of opts.seeds) {
    const entropy = entropyFromInt(seedId);
    for (const [knobSetIdx, knobs] of opts.knobSets.entries()) {
      for (const script of opts.userScripts) {
        let traj: Trajectory;
        if (isStatic(script)) {
          traj = lifetime(entropy, script.sessions, knobs);
        } else {
          const src = opts.ledgerSource;
          if (!src)
            throw new Error(
              `population: ledgerSource required for empirical script "${script.name}"`,
            );
          traj = empiricalLifetime(entropy, script, src, knobs);
        }

        lives.push({
          seedId,
          scriptName: script.name,
          knobSetIdx,
          finalMbti: projectMbti(traj.final.v),
          breakCount: traj.breaks.length,
          drift: l2Drift(traj.final.v, traj.birth.v),
          mpAtAdulthood: mpAtAdulthood(traj),
        });
      }
    }
  }

  return { lives, metrics: computeMetrics(lives) };
}

function computeMetrics(lives: readonly LifeResult[]): AggregateMetrics {
  const n = lives.length;
  const adultMbtiDist: Record<string, number> = {};
  let totalBreaks = 0;
  let livesWithBreak = 0;

  const driftByScript: Record<string, number[]> = {};
  const mpByScript: Record<string, number[]> = {};

  for (const life of lives) {
    adultMbtiDist[life.finalMbti] = (adultMbtiDist[life.finalMbti] ?? 0) + 1;
    totalBreaks += life.breakCount;
    if (life.breakCount > 0) livesWithBreak++;

    if (!driftByScript[life.scriptName]) driftByScript[life.scriptName] = [];
    (driftByScript[life.scriptName] as number[]).push(life.drift);

    if (life.mpAtAdulthood !== undefined) {
      if (!mpByScript[life.scriptName]) mpByScript[life.scriptName] = [];
      (mpByScript[life.scriptName] as number[]).push(life.mpAtAdulthood);
    }
  }

  const mean = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

  const meanDriftByScript: Record<string, number> = {};
  for (const [name, drifts] of Object.entries(driftByScript)) {
    meanDriftByScript[name] = mean(drifts);
  }

  const meanMpAtAdulthoodByScript: Record<string, number> = {};
  for (const [name, mps] of Object.entries(mpByScript)) {
    meanMpAtAdulthoodByScript[name] = mean(mps);
  }

  return {
    n,
    adultMbtiDist,
    meanBreaksPerLife: n === 0 ? 0 : totalBreaks / n,
    breakRarity: n === 0 ? 0 : livesWithBreak / n,
    meanDriftByScript,
    meanMpAtAdulthoodByScript,
  };
}
