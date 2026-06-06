import { describe, expect, it } from "vitest";
import {
  DEFAULT_KNOBS,
  type GlobalKnobs,
  accumulatorDecay,
  charge,
  chargeTension,
  consolidate,
} from "../src/engine/index.js";
import {
  ASPECTS,
  type AspectVector,
  MIGRATION_BUDGET_INIT,
  type Soul,
} from "../src/state/index.js";

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
  /** Brick 5: tension on the tested aspect (default 0 — below θ, no break). */
  t0?: number;
  /** Brick 5: refractory countdown on the tested aspect (default 0 — ready). */
  ref0?: number;
  /** Brick 5: betaGain (resentment multiplier) on the tested aspect (default 1.0). */
  betaGain0?: number;
  /** Brick 5: lifetime set-point migration budget (default full). */
  budget?: number;
}): Soul {
  const {
    v0,
    s0,
    a0 = 0,
    anchor0 = v0,
    stubbornness = 0.5,
    t0 = 0,
    ref0 = 0,
    betaGain0 = 1,
    budget = MIGRATION_BUDGET_INIT,
  } = opts;
  const v = vec(0.5);
  const s = vec(0.5);
  const a = vec(0);
  const anchor = vec(0.5);
  const tension = vec(0);
  const refractory = vec(0);
  const betaGain = vec(1);
  v[A] = v0;
  s[A] = s0;
  a[A] = a0;
  anchor[A] = anchor0;
  tension[A] = t0;
  refractory[A] = ref0;
  betaGain[A] = betaGain0;
  return {
    v,
    s,
    a,
    tension,
    disuseAnchor: anchor,
    refractory,
    betaGain,
    migrationBudget: budget,
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

// ─────────────────────────────────────────────────────────────────────────────
// Brick 5 — tension fast loop.
// ─────────────────────────────────────────────────────────────────────────────

describe("tension charge (chargeTension)", () => {
  it("charges only on hated practice (negative fit AND real practice)", () => {
    const soul = soulWith({ v0: 0.5, s0: 0.5 }); // tension starts at 0
    // Did a lot (practice 1) AND hated it (fit −1) → tension rises.
    const hated = chargeTension(soul, { practice: { [A]: 1 }, fit: { [A]: -1 } });
    expect(hated.tension[A]).toBeGreaterThan(0);
    // Did a lot but LIKED it (fit +1) → no intake; only the leak acts (starts at 0 → stays 0).
    const liked = chargeTension(soul, { practice: { [A]: 1 }, fit: { [A]: 1 } });
    expect(liked.tension[A]).toBe(0);
    // Hated it but didn't actually do it (practice 0) → no intake.
    const idle = chargeTension(soul, { practice: { [A]: 0 }, fit: { [A]: -1 } });
    expect(idle.tension[A]).toBe(0);
  });

  it("leaks (ρ<1): a one-off bad session bleeds off and never accumulates alone", () => {
    let soul = soulWith({ v0: 0.5, s0: 0.5, t0: 1 });
    // No further hated practice → tension decays geometrically by ρ each step.
    const oneStep = chargeTension(soul, { practice: {}, fit: {} });
    expect(oneStep.tension[A]).toBeCloseTo(K.rho, 10); // 0.9 * 1
    for (let i = 0; i < 100; i++) soul = chargeTension(soul, { practice: {}, fit: {} });
    expect(soul.tension[A]).toBeLessThan(1e-3); // bled off toward 0
  });

  it("positive fit leaves tension leaking down, never up", () => {
    let soul = soulWith({ v0: 0.5, s0: 0.5, t0: 1 });
    for (let i = 0; i < 20; i++) {
      soul = chargeTension(soul, { practice: { [A]: 1 }, fit: { [A]: 1 } });
    }
    expect(soul.tension[A]).toBeLessThan(1); // strictly decreased — liked work can't charge
  });

  it("sustained hated practice climbs past θ (earned, not one-off)", () => {
    let soul = soulWith({ v0: 0.5, s0: 0.5 });
    let stepsToThreshold = -1;
    for (let i = 0; i < 100; i++) {
      soul = chargeTension(soul, { practice: { [A]: 1 }, fit: { [A]: -1 } });
      if (stepsToThreshold < 0 && soul.tension[A] > K.theta) stepsToThreshold = i;
    }
    expect(stepsToThreshold).toBeGreaterThan(0); // took repeated sessions, not a single one
    // Steady state of a leaky integrator under constant intake = intake/(1−ρ).
    expect(soul.tension[A]).toBeCloseTo((K.tensionIntake * 1 * 1) / (1 - K.rho), 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Brick 5 — breaking points (rare, earned), routing, refractory, migration.
// ─────────────────────────────────────────────────────────────────────────────

describe("breaking points: rare + earned", () => {
  it("fires only above θ; sub-threshold tension never breaks", () => {
    const base = { v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8, stubbornness: 0.9 };
    const calm = consolidate(soulWith({ ...base, t0: 0.9 }), K, "childhood"); // below θ=1
    const broke = consolidate(soulWith({ ...base, t0: 1.5 }), K, "childhood"); // above θ

    // Sub-threshold: nothing Brick-5 fired — s, betaGain, refractory, tension all untouched.
    expect(calm.s[A]).toBe(0.3);
    expect(calm.betaGain[A]).toBe(1);
    expect(calm.refractory[A]).toBe(0);
    expect(calm.tension[A]).toBe(0.9); // carried through unchanged (no discharge)
    expect(calm.migrationBudget).toBe(MIGRATION_BUDGET_INIT);

    // Over-threshold: a break fired — tension discharged, refractory armed, v moved off calm.
    expect(broke.tension[A]).toBe(0);
    expect(broke.refractory[A]).toBe(K.refractory);
    expect(broke.v[A]).not.toBeCloseTo(calm.v[A]);
  });

  it("break is deterministic (same soul → identical next soul)", () => {
    const soul = soulWith({ v0: 0.8, s0: 0.3, anchor0: 0.8, t0: 1.5, stubbornness: 0.9 });
    expect(consolidate(soul, K, "childhood")).toEqual(consolidate(soul, K, "childhood"));
  });
});

describe("breaking points: stubborn vs clay routing", () => {
  const setup = { v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8, t0: 1.5 }; // v above s (lived-up deviation)

  it("stubborn (high) snaps v back toward s AND raises betaGain (resentment)", () => {
    const calm = consolidate(soulWith({ ...setup, t0: 0.9, stubbornness: 0.95 }), K, "childhood");
    const broke = consolidate(soulWith({ ...setup, stubbornness: 0.95 }), K, "childhood");
    expect(broke.v[A]).toBeLessThan(calm.v[A]); // snapped HOME (toward the lower set point)
    expect(broke.v[A]).toBeGreaterThanOrEqual(broke.s[A]); // didn't overshoot past s
    expect(broke.betaGain[A]).toBeGreaterThan(1); // resentment deepened the homeward pull
  });

  it("clay (low) jumps v toward the lived/escape direction (reconfigure)", () => {
    const calm = consolidate(soulWith({ ...setup, t0: 0.9, stubbornness: 0.05 }), K, "childhood");
    const broke = consolidate(soulWith({ ...setup, stubbornness: 0.05 }), K, "childhood");
    expect(broke.v[A]).toBeGreaterThan(calm.v[A]); // escaped FURTHER in the lived direction (up)
  });

  it("stubborn resents harder than clay", () => {
    const stubborn = consolidate(soulWith({ ...setup, stubbornness: 0.95 }), K, "childhood");
    const clay = consolidate(soulWith({ ...setup, stubbornness: 0.05 }), K, "childhood");
    expect(stubborn.betaGain[A]).toBeGreaterThan(clay.betaGain[A]);
  });

  it("raised betaGain actually deepens the consolidation homeward pull (1.0 ⇒ no change)", () => {
    // Same displacement; the only difference is betaGain. Higher betaGain pulls home more.
    const plain = soulWith({ v0: 0.6, s0: 0.3, a0: 1e-4, stubbornness: 0.5 });
    const resentful = soulWith({ v0: 0.6, s0: 0.3, a0: 1e-4, stubbornness: 0.5, betaGain0: 2 });
    const dPlain = plain.v[A] - consolidate(plain, K, "childhood").v[A];
    const dResent = resentful.v[A] - consolidate(resentful, K, "childhood").v[A];
    expect(dResent).toBeGreaterThan(dPlain); // betaGain 2 pulls home harder than 1
  });
});

describe("breaking points: per-aspect refractory", () => {
  it("an aspect in refractory cannot break, even with tension above θ", () => {
    const inRef = soulWith({ v0: 0.8, s0: 0.3, anchor0: 0.8, t0: 1.5, ref0: 3, stubbornness: 0.9 });
    const next = consolidate(inRef, K, "childhood");
    expect(next.tension[A]).toBe(1.5); // NOT discharged — no break while refractory > 0
    expect(next.betaGain[A]).toBe(1);
    expect(next.s[A]).toBe(0.3);
    expect(next.refractory[A]).toBe(2); // just decremented
  });

  it("breaks exactly once when the window elapses (no chatter)", () => {
    let cur = soulWith({ v0: 0.8, s0: 0.3, anchor0: 0.8, t0: 1.5, ref0: 3, stubbornness: 0.9 });
    const firedAt: number[] = [];
    for (let i = 0; i < 8; i++) {
      const nx = consolidate(cur, K, "childhood");
      if (cur.tension[A] > 0 && nx.tension[A] === 0) firedAt.push(i); // discharge = a break
      cur = nx;
    }
    // refIn 3,2,1 block (i=0,1,2); refIn 0 at i=3 fires; then refractory re-arms to 5.
    expect(firedAt).toEqual([3]);
  });
});

describe("breaking points: capped + budgeted set-point migration", () => {
  const setup = { v0: 0.8, s0: 0.3, a0: 0, anchor0: 0.8, t0: 1.5 };

  it("migrates s a tiny amount toward the lived value, clay more than stubborn", () => {
    const stubborn = consolidate(soulWith({ ...setup, stubbornness: 0.95 }), K, "childhood");
    const clay = consolidate(soulWith({ ...setup, stubbornness: 0.05 }), K, "childhood");
    const dStubborn = stubborn.s[A] - 0.3;
    const dClay = clay.s[A] - 0.3;
    expect(dStubborn).toBeGreaterThan(0); // moved toward the (higher) lived value
    expect(dClay).toBeGreaterThan(dStubborn); // clay migrates more
    expect(dClay).toBeLessThanOrEqual(K.migrationStepCap + 1e-12); // hard per-break cap
  });

  it("s never runs away to the lived value (stays near the set point)", () => {
    const broke = consolidate(soulWith({ ...setup, stubbornness: 0.05 }), K, "childhood");
    expect(broke.s[A] - 0.3).toBeLessThanOrEqual(K.migrationStepCap + 1e-12);
    expect(broke.s[A]).toBeLessThan(0.5); // nowhere near the lived ~0.8 — no mirror
  });

  it("budget caps the displacement and is debited", () => {
    // Budget smaller than the per-break cap → migration is budget-limited, then exhausted.
    const broke = consolidate(
      soulWith({ ...setup, stubbornness: 0.05, budget: 0.005 }),
      K,
      "childhood",
    );
    expect(broke.s[A] - 0.3).toBeCloseTo(0.005, 12); // limited to the remaining budget
    expect(broke.migrationBudget).toBeCloseTo(0, 12); // fully spent
  });

  it("once budget is exhausted, breaks still reconfigure v but s stops moving", () => {
    const calm = consolidate(
      soulWith({ ...setup, t0: 0.9, stubbornness: 0.05, budget: 0 }),
      K,
      "childhood",
    );
    const broke = consolidate(
      soulWith({ ...setup, stubbornness: 0.05, budget: 0 }),
      K,
      "childhood",
    );
    expect(broke.s[A]).toBe(0.3); // s frozen — no budget left
    expect(broke.migrationBudget).toBe(0);
    expect(broke.v[A]).toBeGreaterThan(calm.v[A]); // v still reconfigured (clay escape)
    expect(broke.tension[A]).toBe(0); // still discharged + refractory armed
    expect(broke.refractory[A]).toBe(K.refractory);
  });
});

describe("no-break path is byte-identical to pre-Brick-5", () => {
  it("sub-θ tension perturbs nothing but the carried tension field", () => {
    const opts = { v0: 0.62, s0: 0.31, a0: 0.44, anchor0: 0.7, stubbornness: 0.37 };
    const clean = consolidate(soulWith({ ...opts, t0: 0 }), K, "adolescence");
    const subTension = consolidate(soulWith({ ...opts, t0: 0.9 }), K, "adolescence");
    // Every output field is identical except the tension that was carried in.
    expect(subTension.v).toEqual(clean.v);
    expect(subTension.s).toEqual(clean.s);
    expect(subTension.betaGain).toEqual(clean.betaGain);
    expect(subTension.refractory).toEqual(clean.refractory);
    expect(subTension.disuseAnchor).toEqual(clean.disuseAnchor);
    expect(subTension.migrationBudget).toBe(clean.migrationBudget);
    expect(clean.tension[A]).toBe(0);
    expect(subTension.tension[A]).toBe(0.9);
  });
});
