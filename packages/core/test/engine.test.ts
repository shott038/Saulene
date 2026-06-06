import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOBS,
  type GlobalKnobs,
  accumulatorDecay,
  charge,
  consolidate,
} from "../src/engine/index.js";
import { ASPECTS, type AspectVector, type Soul } from "../src/state/index.js";

const A: keyof AspectVector = "openness"; // the one aspect every test drives

/** A vector with every aspect set to `fill`. */
function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

/**
 * A minimal soul, fully specified per the one aspect under test. `v0`/`s0`/`a0` set the
 * tested aspect; every other aspect is parked at v=s=0.5, a=0 (idle, at its own floor).
 */
function soulWith(opts: {
  v0: number;
  s0: number;
  a0?: number;
  anchor0?: number;
  stubbornness?: number;
}): Soul {
  const { v0, s0, a0 = 0, anchor0 = v0, stubbornness = 0.5 } = opts;
  const v = vec(0.5);
  const s = vec(0.5);
  const a = vec(0);
  const anchor = vec(0.5);
  v[A] = v0;
  s[A] = s0;
  a[A] = a0;
  anchor[A] = anchor0;
  return {
    v,
    s,
    a,
    tension: vec(0),
    disuseAnchor: anchor,
    stubbornness,
    sex: "female",
    mp: 0,
    lastUsedAt: 0,
  };
}

const K = DEFAULT_KNOBS;

/** Run `consolidate` n times in the same stage (drive stays fixed — `a` is untouched). */
function run(soul: Soul, stage: Parameters<typeof consolidate>[2], n: number, knobs = K): Soul {
  let cur = soul;
  for (let i = 0; i < n; i++) cur = consolidate(cur, knobs, stage);
  return cur;
}

describe("accumulator (fast loop)", () => {
  it("half-life→decay: an idle accumulator halves after λ steps", () => {
    const decay = accumulatorDecay(K.lambda);
    expect(decay ** K.lambda).toBeCloseTo(0.5, 10);
  });

  it("leaky EMA converges to a sustained signal and smooths a spike", () => {
    let soul = soulWith({ v0: 0.5, s0: 0.5 });
    // Sustained signal 0.8 → accumulator climbs toward 0.8 (steady state = signal).
    for (let i = 0; i < 200; i++) soul = charge(soul, { [A]: 0.8 });
    expect(soul.a[A]).toBeCloseTo(0.8, 4);
    // A single opposite spike barely dents it (noise rejection).
    const after = charge(soul, { [A]: -1 });
    expect(after.a[A]).toBeGreaterThan(0.4);
  });

  it("decays unobserved aspects toward 0", () => {
    let soul = soulWith({ v0: 0.5, s0: 0.5, a0: 1 });
    for (let i = 0; i < 100; i++) soul = charge(soul, {}); // no signal
    expect(Math.abs(soul.a[A])).toBeLessThan(1e-4);
  });
});

describe("nurture force (room-bounded)", () => {
  it("sustained positive drive moves v toward the upper bound, never past 1", () => {
    // Set point at the bound so spring and nurture agree; isolates 'never overshoots'.
    const soul = soulWith({ v0: 0.5, s0: 1, a0: 0.8 });
    let cur = soul;
    let prev = soul.v[A];
    for (let i = 0; i < 300; i++) {
      cur = consolidate(cur, K, "childhood");
      expect(cur.v[A]).toBeLessThanOrEqual(1); // room + clamp: never overshoots
      expect(cur.v[A]).toBeGreaterThanOrEqual(prev - 1e-12); // monotone up
      prev = cur.v[A];
    }
    expect(cur.v[A]).toBeGreaterThan(0.95);
  });

  it("a huge drive still cannot push past the bound (room → 0 as v → 1)", () => {
    const soul = soulWith({ v0: 0.9, s0: 1, a0: 5 });
    const cur = run(soul, "childhood", 500);
    expect(cur.v[A]).toBeLessThanOrEqual(1);
    expect(cur.v[A]).toBeGreaterThan(0.99);
  });

  it("sustained negative drive moves v toward 0, never below", () => {
    const soul = soulWith({ v0: 0.5, s0: 0, a0: -0.8 });
    let cur = soul;
    for (let i = 0; i < 300; i++) {
      cur = consolidate(cur, K, "childhood");
      expect(cur.v[A]).toBeGreaterThanOrEqual(0);
    }
    expect(cur.v[A]).toBeLessThan(0.05);
  });
});

describe("set-point spring (linear, un-room'd)", () => {
  it("an extreme set point is reachable: pull carries v all the way toward 0.95", () => {
    // Tiny drive marks the aspect exercised so the spring fires; nurture is negligible,
    // so the (un-room'd) spring dominates and carries v up to the extreme set point.
    const soul = soulWith({ v0: 0.5, s0: 0.95, a0: 1e-4 });
    const cur = run(soul, "childhood", 500);
    expect(cur.v[A]).toBeGreaterThan(0.94); // not saturation-killed near the edge
    expect(cur.v[A]).toBeLessThanOrEqual(1);
  });

  it("stubbornness scales the homeward pull (β_eff = β·(0.5 + stubbornness))", () => {
    // Same displacement from s; higher stubbornness pulls home harder in one step.
    const clay = soulWith({ v0: 0.6, s0: 0.4, a0: 1e-4, stubbornness: 0.1 });
    const stubborn = soulWith({ v0: 0.6, s0: 0.4, a0: 1e-4, stubbornness: 0.9 });
    const dClay = clay.v[A] - consolidate(clay, K, "childhood").v[A];
    const dStubborn = stubborn.v[A] - consolidate(stubborn, K, "childhood").v[A];
    expect(dStubborn).toBeGreaterThan(dClay); // both move toward s; stubborn moves more
    expect(dClay).toBeGreaterThan(0);
  });
});

describe("adolescence repels", () => {
  it("stageSign < 0 pushes v AWAY from the set point", () => {
    // v below s: a normal stage pulls up toward s; adolescence must push down (away).
    const soul = soulWith({ v0: 0.4, s0: 0.8, a0: 1e-4 });
    const teen = consolidate(soul, K, "adolescence").v[A];
    const adult = consolidate(soul, K, "early_adulthood").v[A];
    expect(teen).toBeLessThan(0.4); // moved away from s (which is above)
    expect(adult).toBeGreaterThan(0.4); // normal stage moves toward s
  });
});

describe("sticky decay-floor atrophy", () => {
  it("idle slump halts at the floor f = s + (1−κ)(v⁰−s) — never reaches s", () => {
    const soul = soulWith({ v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8 });
    const floor = soul.s[A] + (1 - K.kappa) * (soul.disuseAnchor[A] - soul.s[A]);
    const cur = run(soul, "childhood", 400);
    expect(cur.v[A]).toBeCloseTo(floor, 3); // asymptotes to the floor
    expect(cur.v[A]).toBeGreaterThan(soul.s[A]); // stops above s — keeps (1−κ) of the deviation
    expect(cur.v[A]).toBeGreaterThanOrEqual(floor - 1e-9); // approaches floor from above
  });

  it("disuse never compounds back to s across repeated spells (anchor resets on exercise)", () => {
    let soul = soulWith({ v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8 });
    for (let spell = 0; spell < 4; spell++) {
      soul = run(soul, "childhood", 100); // idle spell → slump to this spell's floor
      // Exercise one step: anchor resets to the freshly-lived value.
      soul = { ...soul, a: { ...soul.a, [A]: 1e-4 } };
      soul = consolidate(soul, K, "childhood");
      soul = { ...soul, a: { ...soul.a, [A]: 0 } };
    }
    // Pure reversion would sit at s = 0.3; the floor mechanism holds it well above.
    expect(soul.v[A]).toBeGreaterThan(0.4);
    expect(soul.v[A]).toBeGreaterThan(soul.s[A]);
  });

  it("anchor for an exercised aspect tracks the freshly-lived value", () => {
    const soul = soulWith({ v0: 0.5, s0: 0.5, a0: 0.5, anchor0: 0.1 });
    const next = consolidate(soul, K, "childhood");
    expect(next.disuseAnchor[A]).toBeCloseTo(next.v[A]); // reset to current, not the stale 0.1
  });
});

describe("old age freezes the lived blend", () => {
  it("near-zero plasticity barely moves v, regardless of drive or pull", () => {
    const drift = soulWith({ v0: 0.7, s0: 0.2, a0: 0.9 }); // strong drive AND far from s
    const next = consolidate(drift, K, "old_adulthood");
    expect(Math.abs(next.v[A] - drift.v[A])).toBeLessThan(0.02);
  });

  it("freezes the blend instead of snapping back to the set point (atrophy frozen too)", () => {
    const idle = soulWith({ v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8 });
    // Same idle spell that slumps fast to the floor in childhood barely moves in old age.
    const old = run(idle, "old_adulthood", 20);
    const young = run(idle, "childhood", 20);
    expect(old.v[A]).toBeGreaterThan(0.79); // frozen near the lived value
    expect(old.v[A] - young.v[A]).toBeGreaterThan(0.05); // plasticity gates the slump
  });
});

describe("determinism & purity", () => {
  it("same (soul, knobs, stage) → identical next soul", () => {
    const soul = soulWith({ v0: 0.62, s0: 0.31, a0: 0.44, anchor0: 0.7, stubbornness: 0.37 });
    expect(consolidate(soul, K, "adolescence")).toEqual(consolidate(soul, K, "adolescence"));
  });

  it("does not mutate the input soul", () => {
    const soul = soulWith({ v0: 0.5, s0: 0.9, a0: 0.5 });
    const beforeV = soul.v[A];
    const beforeA = soul.a[A];
    consolidate(soul, K, "childhood");
    charge(soul, { [A]: 1 });
    expect(soul.v[A]).toBe(beforeV);
    expect(soul.a[A]).toBe(beforeA);
  });

  it("honors custom knobs (κ widens the erodible band)", () => {
    const wide: GlobalKnobs = { ...K, kappa: 0.5 };
    const soul = soulWith({ v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8 });
    const floorDefault = run(soul, "childhood", 400, K).v[A];
    const floorWide = run(soul, "childhood", 400, wide).v[A];
    expect(floorWide).toBeLessThan(floorDefault); // bigger κ → erodes more → lower floor
    expect(floorWide).toBeGreaterThan(soul.s[A]); // still above s
  });
});
