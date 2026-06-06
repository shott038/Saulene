/**
 * @saulene/simulator — the lifetime loop
 *
 * `lifetime(seed, script, knobs) → Trajectory`: birth an ul from entropy, then drive it through
 * a scripted life of synthetic sessions, recording enough to *narrate* the result. No LLM, no IO,
 * no clock — every step is the pure `core` engine; the simulator owns only the loop and the record.
 *
 * Per session (consolidation cadence = EVERY session, the simplest legible choice — documented
 * here so the trajectory's session index == its consolidation index):
 *   1. `charge`        — drive the fast-loop accumulators from `practice` (doing a lot of an aspect
 *                        raises the smoothed drive that pushes `v` up; unexercised aspects decay
 *                        toward 0 → disuse atrophy). We feed `practice` AS the charge signal: the
 *                        instantaneous per-aspect drive. `fit` is NOT mixed in here — it is the
 *                        grievance signal that lives in the tension loop instead.
 *   2. `chargeTension` — charge the slow grievance loop from `{practice, fit}`; only "did a lot AND
 *                        hated it" (negative fit under real practice) accumulates toward a break.
 *   3. `accrueMp`      — age the ul by the session's significance (rate-capped in core).
 *   4. `stageFromMp`   — recompute the life stage at the new age (per-ul jittered bands).
 *   5. `consolidate`   — commit the smoothed accumulator via the update rule; breaking points fire
 *                        here. We mirror core's break predicate (read-only) just before, so the
 *                        trajectory can record which aspect ruptured and how `v`/`s` moved.
 *
 * Determinism is inherited wholesale from `core`: same (seed, script, knobs) → identical Trajectory.
 */

import {
  ASPECTS,
  type Aspect,
  type AspectVector,
  DEFAULT_KNOBS,
  type GlobalKnobs,
  type MbtiLabel,
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
import type { ScriptedSession } from "./script.js";

/** One row of the trajectory: the ul's visible state at a single consolidation. */
export interface TrajectorySnapshot {
  /** Session/consolidation index (0-based). */
  session: number;
  /** Age in maturity points after this session. */
  mp: number;
  /** Life stage this consolidation ran in. */
  stage: Stage;
  /** Full disposition vector after this consolidation (a copy — safe to keep). */
  v: AspectVector;
  /** Display-only MBTI readout of `v` at this point. */
  mbti: MbtiLabel;
}

/** A breaking point that fired during the life — the rare, earned rupture of one aspect. */
export interface BreakEvent {
  /** Session index at which the break fired. */
  session: number;
  /** The aspect that ruptured. */
  aspect: Aspect;
  /** Stage the break fired in (adolescence is where most fire — volatility + repulsion). */
  stage: Stage;
  /** Tension on that aspect at the moment it broke (it discharges to 0 right after). */
  tensionAtBreak: number;
  /** `v` before this consolidation. */
  vBefore: number;
  /** `v` after the break (the reconfigured / snapped value). */
  vAfter: number;
  /** Set point before the break. */
  sBefore: number;
  /** Set point after the break (migration — clay reconfigures more than stubborn). */
  sAfter: number;
}

/** The full record of a scripted life: enough to narrate it, not just its end-state. */
export interface Trajectory {
  /** The ul as birthed from the seed (v = s, nothing lived yet). */
  birth: Soul;
  /** The ul after the last session. */
  final: Soul;
  /** One snapshot per consolidation (per session, at this cadence). */
  snapshots: TrajectorySnapshot[];
  /** Every breaking point that fired, in order. */
  breaks: BreakEvent[];
}

/**
 * Run a synthetic lifetime through the pure engine and return its trajectory.
 *
 * @param seed   Birth entropy bytes (same bytes → same ul; see `entropyFromInt`).
 * @param script The ordered sessions the ul lives (see `./script`).
 * @param knobs  Global engine knobs (defaults to the untuned `DEFAULT_KNOBS`).
 */
export function lifetime(
  seed: Uint8Array,
  script: readonly ScriptedSession[],
  knobs: GlobalKnobs = DEFAULT_KNOBS,
): Trajectory {
  // `now` only sets lastUsedAt (neglect clock, unused here) — inject a fixed value for determinism.
  const birth = seedFromEntropy(seed, 0);
  let soul = birth;

  const snapshots: TrajectorySnapshot[] = [];
  const breaks: BreakEvent[] = [];

  script.forEach((sess, i) => {
    // 1. Fast loop: practice IS the drive signal (how much the aspect was exercised).
    soul = charge(soul, sess.practice, knobs);
    // 2. Grievance loop: only negative fit under real practice charges tension.
    soul = chargeTension(soul, { practice: sess.practice, fit: sess.fit }, knobs);
    // 3. Age, then 4. recompute stage at the new age (per-ul jittered bands).
    soul = { ...soul, mp: accrueMp(soul, sess.significance) };
    const stage = stageFromMp(soul.mp, soul);

    // Mirror core's break predicate (read-only) so we can attribute ruptures this consolidation.
    // Must match core exactly, including the plasticity-gated threshold θ/plasticity(stage).
    const breakThreshold = knobs.theta / stageRules(stage).plasticity;
    const priming = ASPECTS.filter(
      (a) => soul.tension[a] > breakThreshold && soul.refractory[a] === 0,
    );
    const pre = soul;

    // 5. Consolidate (breaking points fire inside core, after the normal update).
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

    snapshots.push({
      session: i,
      mp: soul.mp,
      stage,
      v: { ...soul.v },
      mbti: projectMbti(soul.v),
    });
  });

  return { birth, final: soul, snapshots, breaks };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: build birth entropy from a small integer seed (for tests/exploration).
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 8-byte entropy from a non-negative integer — handy for seed search in tests. */
export function entropyFromInt(n: number): Uint8Array {
  const bytes = new Uint8Array(8);
  let x = n >>> 0;
  for (let i = 0; i < 8; i++) {
    bytes[i] = x & 0xff;
    x = Math.floor(x / 256);
  }
  return bytes;
}
