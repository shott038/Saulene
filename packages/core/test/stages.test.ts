import { describe, expect, it } from "vitest";
import {
  BOUNDARY_JITTER_MP,
  MP_PER_FULL_SESSION,
  MP_STEP_CAP,
  STAGES,
  STAGE_BANDS,
  type Stage,
  accrueMp,
  presentedAge,
  stageFromMp,
  stageRules,
} from "../src/stages/index.js";
import {
  ASPECTS,
  type AspectVector,
  MIGRATION_BUDGET_INIT,
  type Soul,
} from "../src/state/index.js";

/** Build a vector with every aspect set to `fill`. */
function vec(fill: number): AspectVector {
  return Object.fromEntries(ASPECTS.map((a) => [a, fill])) as AspectVector;
}

/** A minimal valid soul; `seed` perturbs identity fields so distinct souls hash differently. */
function makeSoul(seed = 0): Soul {
  const s = vec(0.5);
  // Perturb set points deterministically by seed so different seeds → different soulHash.
  for (let i = 0; i < ASPECTS.length; i++) {
    const a = ASPECTS[i] as keyof AspectVector;
    s[a] = ((seed * 7 + i * 13) % 100) / 100;
  }
  return {
    v: vec(0.5),
    s,
    a: vec(0),
    tension: vec(0),
    disuseAnchor: vec(0.5),
    refractory: vec(0),
    betaGain: vec(1),
    migrationBudget: MIGRATION_BUDGET_INIT,
    stubbornness: ((seed * 3) % 100) / 100,
    sex: seed % 2 === 0 ? "male" : "female",
    mp: 0,
    lastUsedAt: 0,
  };
}

describe("stageFromMp", () => {
  it("returns the four stages in correct MP order (no soul → plain bands)", () => {
    const [b0, b1, b2] = STAGE_BANDS;
    expect(stageFromMp(0)).toBe("childhood");
    expect(stageFromMp(b0 - 1)).toBe("childhood");
    expect(stageFromMp(b0 + 1)).toBe("adolescence");
    expect(stageFromMp(b1 + 1)).toBe("early_adulthood");
    expect(stageFromMp(b2 + 1)).toBe("old_adulthood");
    expect(stageFromMp(1e9)).toBe("old_adulthood");
  });

  it("is monotonic in mp: stage index never decreases as mp rises", () => {
    const order = new Map<Stage, number>(STAGES.map((st, i) => [st, i]));
    let prev = -1;
    for (let mp = 0; mp <= 800; mp += 5) {
      const idx = order.get(stageFromMp(mp)) as number;
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });

  it("applies bounded per-ul jitter to boundaries", () => {
    const soul = makeSoul(1);
    const [b0] = STAGE_BANDS;
    // Within ±jitter of the first boundary, the soul may differ from the plain band,
    // but never beyond the jitter window.
    expect(stageFromMp(b0 - BOUNDARY_JITTER_MP - 1, soul)).toBe("childhood");
    expect(stageFromMp(b0 + BOUNDARY_JITTER_MP + 1, soul)).toBe("adolescence");
  });

  it("jitter is deterministic: same soul → same crossing every time", () => {
    const soul = makeSoul(42);
    for (let mp = 80; mp <= 120; mp++) {
      expect(stageFromMp(mp, soul)).toBe(stageFromMp(mp, soul));
    }
  });

  it("different souls can cross on different clocks", () => {
    // Scan the jitter window around the first boundary; at least one mp must classify
    // two distinct souls differently (otherwise jitter does nothing).
    const a = makeSoul(3);
    const b = makeSoul(99);
    const [b0] = STAGE_BANDS;
    let diverged = false;
    for (let mp = b0 - BOUNDARY_JITTER_MP; mp <= b0 + BOUNDARY_JITTER_MP; mp++) {
      if (stageFromMp(mp, a) !== stageFromMp(mp, b)) diverged = true;
    }
    expect(diverged).toBe(true);
  });

  it("jittered boundaries never reorder (gap > 2·jitter holds)", () => {
    for (let seed = 0; seed < 50; seed++) {
      const soul = makeSoul(seed);
      const order = new Map<Stage, number>(STAGES.map((st, i) => [st, i]));
      let prev = -1;
      for (let mp = 0; mp <= 800; mp += 1) {
        const idx = order.get(stageFromMp(mp, soul)) as number;
        expect(idx).toBeGreaterThanOrEqual(prev);
        prev = idx;
      }
    }
  });
});

describe("stageRules invariants", () => {
  it("plasticity ordering: childhood ≥ adolescence > early_adulthood > old_adulthood", () => {
    const c = stageRules("childhood").plasticity;
    const a = stageRules("adolescence").plasticity;
    const e = stageRules("early_adulthood").plasticity;
    const o = stageRules("old_adulthood").plasticity;
    expect(c).toBeGreaterThanOrEqual(a);
    expect(a).toBeGreaterThan(e);
    expect(e).toBeGreaterThan(o);
  });

  it("old_adulthood plasticity is the floor (smallest, ≈0 but > 0)", () => {
    const o = stageRules("old_adulthood").plasticity;
    for (const st of STAGES) {
      expect(o).toBeLessThanOrEqual(stageRules(st).plasticity);
    }
    expect(o).toBeGreaterThan(0);
  });

  it("stageSign is negative ONLY in adolescence, positive elsewhere", () => {
    expect(stageRules("adolescence").stageSign).toBeLessThan(0);
    expect(stageRules("childhood").stageSign).toBeGreaterThan(0);
    expect(stageRules("early_adulthood").stageSign).toBeGreaterThan(0);
    expect(stageRules("old_adulthood").stageSign).toBeGreaterThan(0);
  });

  it("adolescence sign is small (residual tether: quiet, not off)", () => {
    expect(Math.abs(stageRules("adolescence").stageSign)).toBeLessThan(1);
    expect(stageRules("adolescence").stageSign).not.toBe(0);
  });

  it("volatility spikes in adolescence (highest of all stages)", () => {
    const a = stageRules("adolescence").volatility;
    for (const st of STAGES) {
      if (st !== "adolescence") expect(a).toBeGreaterThan(stageRules(st).volatility);
    }
  });
});

describe("accrueMp", () => {
  it("respects the per-step cap regardless of input significance", () => {
    const soul = makeSoul();
    for (const sig of [1, 5, 100, 1e9, Number.POSITIVE_INFINITY]) {
      expect(accrueMp(soul, sig) - soul.mp).toBeLessThanOrEqual(MP_STEP_CAP);
    }
  });

  it("clamps negative significance to zero gain (never ages backward)", () => {
    const soul = makeSoul();
    expect(accrueMp(soul, -5)).toBe(soul.mp);
    expect(accrueMp(soul, 0)).toBe(soul.mp);
  });

  it("is a clean bounded linear mapping below the cap", () => {
    const soul = makeSoul();
    // With these placeholders the cap binds before a full session; check a small sig stays linear.
    const sig = 0.25;
    const expected = Math.min(MP_STEP_CAP, sig * MP_PER_FULL_SESSION);
    expect(accrueMp(soul, sig) - soul.mp).toBeCloseTo(expected);
  });

  it("is pure: does not mutate the soul", () => {
    const soul = makeSoul();
    const before = soul.mp;
    accrueMp(soul, 1);
    expect(soul.mp).toBe(before);
  });
});

describe("presentedAge", () => {
  const [b0, b1, b2] = STAGE_BANDS;

  function soulWithMp(mp: number): Soul {
    const soul = makeSoul(0);
    return { ...soul, mp };
  }

  it("bounds: output is always in [13, 65]", () => {
    for (const mp of [
      0,
      1,
      b0 - 1,
      b0,
      b0 + 1,
      b1 - 1,
      b1,
      b1 + 1,
      b2 - 1,
      b2,
      b2 + 1,
      2000,
      1e6,
    ]) {
      const age = presentedAge(soulWithMp(mp));
      expect(age).toBeGreaterThanOrEqual(13);
      expect(age).toBeLessThanOrEqual(65);
    }
  });

  it("monotonic: age never decreases as mp rises", () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (let mp = 0; mp <= 2000; mp += 5) {
      const age = presentedAge(soulWithMp(mp));
      expect(age).toBeGreaterThanOrEqual(prev);
      prev = age;
    }
  });

  it("childhood (mp=0 to b0) presents as 13–17", () => {
    expect(presentedAge(soulWithMp(0))).toBeCloseTo(13, 1);
    expect(presentedAge(soulWithMp(b0 - 0.01))).toBeLessThan(17);
    expect(presentedAge(soulWithMp(b0 - 0.01))).toBeGreaterThan(13);
  });

  it("adolescence (mp=b0 to b1) presents as 17–24", () => {
    expect(presentedAge(soulWithMp(b0))).toBeCloseTo(17, 1);
    expect(presentedAge(soulWithMp(b1 - 0.01))).toBeLessThan(24);
    expect(presentedAge(soulWithMp(b1 - 0.01))).toBeGreaterThan(17);
  });

  it("early_adulthood (mp=b1 to b2) presents as 25–40", () => {
    expect(presentedAge(soulWithMp(b1))).toBeCloseTo(25, 1);
    expect(presentedAge(soulWithMp(b2 - 0.01))).toBeLessThan(40);
    expect(presentedAge(soulWithMp(b2 - 0.01))).toBeGreaterThan(25);
  });

  it("old_adulthood (mp>=b2) presents as 42–65 (asymptotic)", () => {
    expect(presentedAge(soulWithMp(b2))).toBeCloseTo(42, 1);
    expect(presentedAge(soulWithMp(b2 + 500))).toBeGreaterThan(53); // half-sat point ≈ 53.5
    expect(presentedAge(soulWithMp(1e6))).toBeCloseTo(65, 0);
  });

  it("is pure: does not mutate the soul", () => {
    const soul = soulWithMp(300);
    const mpBefore = soul.mp;
    presentedAge(soul);
    expect(soul.mp).toBe(mpBefore);
  });
});
