import {
  ASPECTS,
  type AspectVector,
  type Soul,
  type Stage,
  projectMbti,
  seedFromEntropy,
} from "@saulene/core";
import { type Trajectory, entropyFromInt, lifetime } from "@saulene/simulator";
import { describe, expect, it } from "vitest";
import {
  ablation,
  crossSoulConfusion,
  fakeJudge,
  runHarness,
  stageSilhouette,
  traitRecovery,
  trajectory,
} from "../src/index.js";
import { fakeSoulHash, idealRenderer, ignoreAspectRenderer, stickeredRenderer } from "./fakes.js";

const judge = fakeJudge();
const soul = (n: number): Soul => seedFromEntropy(entropyFromInt(n), 0);

/** A uniform aspect vector at `x`. */
function uniform(x: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, x])) as AspectVector;
}

/** Baseline 0.5 everywhere, except `movers` set to `x` — mirrors a real life drifting a few aspects. */
function drift(x: number, movers: (typeof ASPECTS)[number][]): AspectVector {
  const v = uniform(0.5);
  for (const a of movers) v[a] = x;
  return v;
}

/** Build a synthetic trajectory: one snapshot per supplied (stage, v) pair, plus birth/final. */
function makeTrajectory(points: { stage: Stage; v: AspectVector }[]): Trajectory {
  const birth = soul(1);
  return {
    birth,
    final: birth,
    breaks: [],
    snapshots: points.map((p, i) => ({
      session: i,
      mp: i * 10,
      stage: p.stage,
      v: p.v,
      mbti: projectMbti(p.v),
    })),
  };
}

describe("metric 1 — trait-recovery / anti-sticker", () => {
  it("ideal renderer → low recovery error, no sticker alarm", async () => {
    const r = await traitRecovery(soul(7), idealRenderer, judge);
    expect(r.meanError).toBeLessThan(0.001); // only the codec's 4-dp rounding
    expect(r.stickerAlarm).toBe(false);
    expect(r.baselineDistance).toBeGreaterThan(0.05);
  });

  it("stickered renderer → recovery collapses to baseline → alarm raised", async () => {
    const r = await traitRecovery(soul(7), stickeredRenderer, judge);
    expect(r.baselineDistance).toBeLessThan(0.001);
    expect(r.stickerAlarm).toBe(true);
    expect(r.meanError).toBeGreaterThan(0.02); // it recovered nothing soul-specific
  });
});

describe("metric 2 — cross-soul confusion matrix", () => {
  const souls = [1, 2, 3, 4].map(soul);

  it("distinct fake voices → high diagonal", async () => {
    const r = await crossSoulConfusion(souls, idealRenderer, judge, { trialsPerSoul: 3 });
    expect(r.diagonalRate).toBe(1);
    expect(r.distinct).toBe(true);
    // off-diagonal is empty
    for (let i = 0; i < souls.length; i++) {
      for (let j = 0; j < souls.length; j++) {
        if (i !== j) expect(r.matrix[i]?.[j]).toBe(0);
      }
    }
  });

  it("identical fake voices → low diagonal", async () => {
    const r = await crossSoulConfusion(souls, stickeredRenderer, judge, { trialsPerSoul: 3 });
    expect(r.diagonalRate).toBeCloseTo(1 / souls.length, 6);
    expect(r.distinct).toBe(false);
  });
});

describe("metric 3 — longitudinal trajectory", () => {
  it("smooth drift → perceptible + continuous → pass", async () => {
    // 13 timepoints drifting uniformly 0.2 → 0.8 across the four stages.
    const stages: Stage[] = ["childhood", "adolescence", "early_adulthood", "old_adulthood"];
    const points = Array.from({ length: 13 }, (_, i) => ({
      stage: stages[Math.min(3, Math.floor(i / 4))] as Stage,
      v: drift(0.2 + (0.6 * i) / 12, ["openness", "intellect"]),
    }));
    const r = await trajectory(makeTrajectory(points), idealRenderer, judge, { timepoints: 13 });
    expect(r.perceptible).toBe(true);
    expect(r.continuous).toBe(true);
    expect(r.pass).toBe(true);
  });

  it("stickered renderer → no net drift → not perceptible → fail", async () => {
    const points = Array.from({ length: 13 }, (_, i) => ({
      stage: "childhood" as Stage,
      v: uniform(0.2 + (0.6 * i) / 12),
    }));
    const r = await trajectory(makeTrajectory(points), stickeredRenderer, judge);
    expect(r.netDisplacement).toBe(0);
    expect(r.perceptible).toBe(false);
    expect(r.pass).toBe(false);
  });

  it("a personality teleport trips the jerk detector", async () => {
    const points = [
      { stage: "childhood" as Stage, v: uniform(0.2) },
      { stage: "childhood" as Stage, v: uniform(0.21) },
      { stage: "old_adulthood" as Stage, v: uniform(0.95) }, // teleport
    ];
    const r = await trajectory(makeTrajectory(points), idealRenderer, judge, { timepoints: 3 });
    expect(r.perceptible).toBe(true);
    expect(r.continuous).toBe(false);
    expect(r.pass).toBe(false);
  });
});

describe("metric 4 — stage silhouette", () => {
  it("tight per-stage clusters → high silhouette → clustered", async () => {
    const centers: Record<Stage, number> = {
      childhood: 0.2,
      adolescence: 0.4,
      early_adulthood: 0.6,
      old_adulthood: 0.8,
    };
    const points: { stage: Stage; v: AspectVector }[] = [];
    for (const stage of Object.keys(centers) as Stage[]) {
      for (const jitter of [-0.01, 0, 0.01]) {
        points.push({ stage, v: uniform(centers[stage] + jitter) });
      }
    }
    const r = await stageSilhouette(makeTrajectory(points), idealRenderer, judge);
    expect(r.clustered).toBe(true);
    expect(r.meanSilhouette).toBeGreaterThan(0.5);
    expect(Object.keys(r.perStage)).toHaveLength(4);
  });

  it("stickered renderer → no separation → not clustered", async () => {
    const points: { stage: Stage; v: AspectVector }[] = [];
    for (const stage of ["childhood", "adolescence"] as Stage[]) {
      for (const x of [0.3, 0.7]) points.push({ stage, v: uniform(x) });
    }
    const r = await stageSilhouette(makeTrajectory(points), stickeredRenderer, judge);
    expect(r.meanSilhouette).toBe(0);
    expect(r.clustered).toBe(false);
  });
});

describe("metric 5 — per-aspect ablation sensitivity", () => {
  it("faithful renderer → every aspect monotonic + proportional, none flat", async () => {
    const r = await ablation(soul(3), idealRenderer, judge);
    expect(r.flatAspects).toHaveLength(0);
    expect(r.allMonotonic).toBe(true);
    for (const aspect of ASPECTS) {
      expect(r.perAspect[aspect].meanSensitivity).toBeGreaterThan(0.5);
      expect(r.perAspect[aspect].monotonic).toBe(true);
    }
  });

  it("a renderer deaf to one aspect → that aspect flagged flat", async () => {
    const r = await ablation(soul(3), ignoreAspectRenderer("compassion"), judge);
    expect(r.flatAspects).toEqual(["compassion"]);
    expect(r.perAspect.compassion.flat).toBe(true);
    expect(r.perAspect.openness.flat).toBe(false);
  });
});

describe("runHarness — end-to-end + determinism", () => {
  it("runs all five metrics on a real replayed lifetime", async () => {
    const report = await runHarness(idealRenderer, judge);
    expect(report.traitRecovery).toHaveLength(4);
    expect(report.traitRecovery.every((t) => !t.stickerAlarm)).toBe(true);
    expect(report.crossSoul.distinct).toBe(true);
    expect(report.ablation.flatAspects).toHaveLength(0);
    expect(report.battery.version).toBe("battery-v1");
    // The simulated life crosses multiple stages and drifts.
    expect(report.trajectory.netDisplacement).toBeGreaterThan(0);
  });

  it("the stickered renderer fails the harness everywhere it should", async () => {
    const report = await runHarness(stickeredRenderer, judge);
    expect(report.traitRecovery.every((t) => t.stickerAlarm)).toBe(true);
    expect(report.crossSoul.distinct).toBe(false);
    expect(report.trajectory.perceptible).toBe(false);
    expect(report.ablation.flatAspects.length).toBeGreaterThan(0);
  });

  it("is deterministic: same seeds + fakeJudge → identical report", async () => {
    const a = await runHarness(idealRenderer, judge);
    const b = await runHarness(idealRenderer, judge);
    expect(a).toEqual(b);
  });

  it("fakeSoulHash is stable + distinct across seeds", () => {
    expect(fakeSoulHash(soul(1))).toBe(fakeSoulHash(soul(1)));
    expect(fakeSoulHash(soul(1))).not.toBe(fakeSoulHash(soul(2)));
  });
});
