/**
 * @saulene/life-sim-pop — runnable population sweep
 *
 * Multi-thousand-life deterministic sweep: run `pnpm --filter @saulene/life-sim-pop pop`
 * after building. Dumps results to tools/life-sim-pop/population-results.json and prints
 * a summary including a worked power-analysis example.
 *
 * IO lives here; everything else in this package is pure.
 */

import { createReadStream, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { DEFAULT_KNOBS } from "@saulene/core";
import type { GlobalKnobs } from "@saulene/core";
import { block, script } from "@saulene/simulator";
import { EmpiricalLedgerSource } from "./empirical-source.js";
import { crnPaired, frozenSoulAB, latinHypercube, powerAnalysis } from "./experiment.js";
import { population } from "./population.js";
import type { CorpusRecord } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load corpus ───────────────────────────────────────────────────────────────

async function loadCorpus(path: string): Promise<CorpusRecord[]> {
  const records: CorpusRecord[] = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) records.push(JSON.parse(trimmed) as CorpusRecord);
  }
  return records;
}

// ── Static user scripts (classic scripted-life patterns) ──────────────────────

const alignedDeveloper = {
  name: "aligned-developer",
  sessions: script(
    block({
      aspects: ["intellect", "openness"],
      practice: 0.8,
      fit: 0.7,
      significance: 0.6,
      count: 80,
    }),
    block({
      aspects: ["industriousness", "orderliness"],
      practice: 0.5,
      fit: 0.4,
      significance: 0.5,
      count: 60,
    }),
    block({
      aspects: ["intellect", "assertiveness"],
      practice: 0.7,
      fit: 0.6,
      significance: 0.6,
      count: 80,
    }),
    block({
      aspects: ["openness", "intellect"],
      practice: 0.9,
      fit: 0.8,
      significance: 0.7,
      count: 80,
    }),
  ),
};

const grindDeveloper = {
  name: "grind-developer",
  sessions: script(
    // Heavy orderliness/industriousness practice the ul hates
    block({
      aspects: ["industriousness", "orderliness"],
      practice: 0.9,
      fit: -0.7,
      significance: 0.6,
      count: 120,
    }),
    block({ aspects: ["intellect"], practice: 0.3, fit: 0.2, significance: 0.4, count: 60 }),
    block({
      aspects: ["industriousness", "orderliness"],
      practice: 0.9,
      fit: -0.8,
      significance: 0.7,
      count: 120,
    }),
  ),
};

const creativeWriter = {
  name: "creative-writer",
  sessions: script(
    block({
      aspects: ["openness", "enthusiasm"],
      practice: 0.9,
      fit: 0.8,
      significance: 0.7,
      count: 100,
    }),
    block({
      aspects: ["openness", "intellect"],
      practice: 0.7,
      fit: 0.6,
      significance: 0.5,
      count: 80,
    }),
    block({
      aspects: ["compassion", "enthusiasm"],
      practice: 0.5,
      fit: 0.5,
      significance: 0.5,
      count: 60,
    }),
    block({ aspects: ["openness"], practice: 0.8, fit: 0.7, significance: 0.6, count: 60 }),
  ),
};

const isolatedScholar = {
  name: "isolated-scholar",
  sessions: script(
    block({
      aspects: ["intellect", "withdrawal"],
      practice: 0.8,
      fit: 0.6,
      significance: 0.5,
      count: 150,
    }),
    block({ aspects: ["openness"], practice: 0.6, fit: 0.5, significance: 0.4, count: 80 }),
    block({
      aspects: ["intellect", "withdrawal"],
      practice: 0.9,
      fit: 0.7,
      significance: 0.6,
      count: 70,
    }),
  ),
};

// ── Knob variants ─────────────────────────────────────────────────────────────

const looseKnobs: GlobalKnobs = { ...DEFAULT_KNOBS, alpha: DEFAULT_KNOBS.alpha * 1.5 };

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const corpusPath = join(__dirname, "../fixtures/corpus.sample.jsonl");
  const corpus = await loadCorpus(corpusPath);

  console.log("\n=== Saulene population sweep ===");
  console.log(`Corpus: ${corpus.length} records\n`);

  // ── 1. Static-script population: 1,500 lives ─────────────────────────────
  const SEEDS = Array.from({ length: 500 }, (_, i) => i);
  const userScripts = [alignedDeveloper, grindDeveloper, creativeWriter, isolatedScholar];
  const knobSets = [DEFAULT_KNOBS, looseKnobs];

  console.log(
    `Running ${SEEDS.length} seeds × ${userScripts.length} scripts × ${knobSets.length} knob sets = ${SEEDS.length * userScripts.length * knobSets.length} lives...`,
  );
  const t0 = performance.now();
  const result = population({ seeds: SEEDS, userScripts, knobSets });
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`Done in ${elapsed}s — ${result.lives.length} lives simulated.\n`);

  const m = result.metrics;
  console.log("── Aggregate metrics ──");
  console.log(`  n:                   ${m.n}`);
  console.log(`  break rarity:        ${(m.breakRarity * 100).toFixed(1)}% of lives had ≥1 break`);
  console.log(`  mean breaks/life:    ${m.meanBreaksPerLife.toFixed(3)}`);
  console.log("\n  Adult MBTI distribution (top 8):");
  const sorted = Object.entries(m.adultMbtiDist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  for (const [mbti, count] of sorted) {
    console.log(
      `    ${mbti.padEnd(6)} ${count.toString().padStart(5)}  (${((count / m.n) * 100).toFixed(1)}%)`,
    );
  }

  console.log("\n  Drift by script (mean L2 from birth v):");
  for (const [script, drift] of Object.entries(m.meanDriftByScript)) {
    console.log(`    ${script.padEnd(24)} ${drift.toFixed(4)}`);
  }

  // ── 2. CRN paired design ─────────────────────────────────────────────────
  const crnResults = crnPaired({
    seeds: SEEDS.slice(0, 200),
    sessions: alignedDeveloper.sessions,
    knobA: DEFAULT_KNOBS,
    knobB: looseKnobs,
  });
  const meanDelta = crnResults.reduce((s, r) => s + r.delta, 0) / crnResults.length;
  const varDelta =
    crnResults.reduce((s, r) => s + (r.delta - meanDelta) ** 2, 0) / (crnResults.length - 1);
  console.log(
    `\n── CRN paired (aligned-developer, default vs loose alpha, n=${crnResults.length}) ──`,
  );
  console.log(`  mean |vA − vB|: ${meanDelta.toFixed(5)}`);
  console.log(`  var  |vA − vB|: ${varDelta.toFixed(6)}`);

  // ── 3. Frozen-soul A/B ───────────────────────────────────────────────────
  const frozenResults = frozenSoulAB({
    seeds: SEEDS.slice(0, 200),
    sessions: alignedDeveloper.sessions,
  });
  const meanCausal = frozenResults.reduce((s, r) => s + r.causalDrift, 0) / frozenResults.length;
  const varCausal =
    frozenResults.reduce((s, r) => s + (r.causalDrift - meanCausal) ** 2, 0) /
    (frozenResults.length - 1);
  console.log(`\n── Frozen-soul A/B (aligned-developer, n=${frozenResults.length}) ──`);
  console.log(`  mean causal drift (L2): ${meanCausal.toFixed(5)}`);
  console.log(`  var  causal drift:      ${varCausal.toFixed(6)}`);

  // ── 4. LHS ───────────────────────────────────────────────────────────────
  const lhsSamples = latinHypercube({
    n: 50,
    seedPool: SEEDS,
    scriptCount: userScripts.length,
    knobRanges: {
      alpha: { min: DEFAULT_KNOBS.alpha * 0.5, max: DEFAULT_KNOBS.alpha * 2 },
      theta: { min: DEFAULT_KNOBS.theta * 0.5, max: DEFAULT_KNOBS.theta * 2 },
    },
    rngSeed: 42,
  });
  const alphaVals = lhsSamples.map((s) => s.knobs.alpha ?? 0);
  const thetaVals = lhsSamples.map((s) => s.knobs.theta ?? 0);
  console.log("\n── Latin-hypercube sampling ──");
  console.log(`  ${lhsSamples.length} samples across seed × script × {alpha, theta}`);
  console.log(
    `  alpha range: [${alphaVals.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY).toFixed(4)}, ${alphaVals.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY).toFixed(4)}]`,
  );
  console.log(
    `  theta range: [${thetaVals.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY).toFixed(4)}, ${thetaVals.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY).toFixed(4)}]`,
  );

  // ── 5. Power analysis ────────────────────────────────────────────────────
  console.log("\n── Power analysis (worked example) ──");
  // Use the CRN pilot data: we observed meanDelta as the effect, varDelta as variance.
  // Question: how many paired lives do we need to detect this effect at 80% power, α=0.05?
  if (meanDelta > 0 && varDelta > 0) {
    try {
      const power = powerAnalysis({
        observedEffect: meanDelta,
        observedVariance: varDelta,
        alpha: 0.05,
        targetPower: 0.8,
      });
      console.log(`  Pilot: meanDelta=${meanDelta.toFixed(5)}, varDelta=${varDelta.toFixed(6)}`);
      console.log("  To detect this knob effect at 80% power (α=0.05):");
      console.log(`    n per arm:   ${power.nPerGroup}`);
      console.log(`    n total:     ${power.nTotal}`);
      console.log(
        `  (Run ${power.nTotal} paired lives — far cheaper than the ${SEEDS.length * 2} we just ran for the full sweep.)`,
      );
    } catch {
      console.log("  (Effect too small to analyze — knob difference is negligible.)");
    }
  } else {
    // Provide a hypothetical example from the frozen-soul data
    const hypotheticalEffect = meanCausal > 0 ? meanCausal * 0.5 : 0.02;
    const hypotheticalVariance = varCausal > 0 ? varCausal : 0.001;
    if (hypotheticalEffect > 0 && hypotheticalVariance > 0) {
      const power = powerAnalysis({
        observedEffect: hypotheticalEffect,
        observedVariance: hypotheticalVariance,
        alpha: 0.05,
        targetPower: 0.8,
      });
      console.log(
        `  Hypothetical: detect half the observed causal drift (${hypotheticalEffect.toFixed(5)}) at 80% power:`,
      );
      console.log(`    n per group: ${power.nPerGroup}`);
      console.log(`    n total:     ${power.nTotal}`);
    }
  }

  // ── Determinism check ────────────────────────────────────────────────────
  console.log("\n── Determinism check ──");
  const result2 = population({
    seeds: SEEDS.slice(0, 10),
    userScripts: [alignedDeveloper],
    knobSets: [DEFAULT_KNOBS],
  });
  const result3 = population({
    seeds: SEEDS.slice(0, 10),
    userScripts: [alignedDeveloper],
    knobSets: [DEFAULT_KNOBS],
  });
  const allMatch = result2.lives.every((life, i) => {
    const other = result3.lives[i];
    return other !== undefined && life.finalMbti === other.finalMbti && life.drift === other.drift;
  });
  console.log(`  Same inputs → identical outputs: ${allMatch ? "✓ PASS" : "✗ FAIL"}`);

  // ── Dump to JSON ──────────────────────────────────────────────────────────
  const outputPath = join(__dirname, "../population-results.json");
  writeFileSync(
    outputPath,
    JSON.stringify(
      {
        summary: {
          n: result.metrics.n,
          breakRarity: result.metrics.breakRarity,
          meanBreaksPerLife: result.metrics.meanBreaksPerLife,
          adultMbtiDist: result.metrics.adultMbtiDist,
          meanDriftByScript: result.metrics.meanDriftByScript,
          meanMpAtAdulthoodByScript: result.metrics.meanMpAtAdulthoodByScript,
        },
        crn: {
          n: crnResults.length,
          meanDelta,
          varDelta,
        },
        frozenAB: {
          n: frozenResults.length,
          meanCausalDrift: meanCausal,
          varCausalDrift: varCausal,
        },
        lhsSamples: lhsSamples.length,
        determinismCheck: allMatch,
      },
      null,
      2,
    ),
  );
  console.log(`\nResults → ${outputPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
