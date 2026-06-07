/**
 * @saulene/harness — Phase 4: forced-choice identification across a difficulty gradient. Dev-only.
 *
 * Run:  pnpm --filter @saulene/harness run ident
 *
 * Phase 3.5 proved the easy end (max contrast → 100%). This fills in the curve: vary how far each
 * persona sits from base Claude (`r_B`) and measure how identification degrades, to find the
 * DISTINCTIVENESS THRESHOLD. Personas at controlled L2 distances (cold/warm × near/middle/extreme),
 * S1 delivery, 6-prompt battery, k=3, arms=sonnet, judge=haiku. A blind (N+1)-way line-up identifies
 * each response among the persona descriptions + a "default Claude" option (chance = 1/(N+1)).
 *
 * Subscription-only (no API key); reuses the response cache; never in CI.
 */

import { writeFileSync } from "node:fs";
import { render as realRender } from "@saulene/renderer";
import { ResponseCollector } from "./ab-collect.js";
import { CONCURRENCY, K, mapLimit, r3 } from "./ab-core.js";
import { AB_BATTERY } from "./battery.js";
import { DEFAULT_DESC, DEFAULT_KEY, buildPersonaLadder } from "./ident-souls.js";
import { type Candidate, identifyPersona } from "./identify.js";
import { ClaudeCliClient } from "./llm.js";

const OUT_PATH = ".ident-run.json";

async function main(): Promise<void> {
  const personas = buildPersonaLadder();
  const prompts = AB_BATTERY.prompts;
  const collector = new ResponseCollector(); // sonnet arms
  const judge = new ClaudeCliClient({ cachePath: ".judge-cache.json", model: "haiku" });

  const candidates: Candidate[] = [
    ...personas.map((p) => ({ key: p.id, description: p.description })),
    { key: DEFAULT_KEY, description: DEFAULT_DESC },
  ];
  const chance = 1 / candidates.length;

  console.log(
    `Identification gradient — arms=${collector.model}, judge=haiku, personas=${personas.length}, prompts=${prompts.length}, k=${K}, chance=${r3(chance)}.`,
  );
  console.log("Persona ladder (L2 from r_B):");
  for (const p of personas) console.log(`  ${p.id.padEnd(16)} α=${p.alpha}  L2=${r3(p.l2)}`);

  // ── Collect responses: souled (S1) per persona + control (no voice, reuses Phase-2 cache). ──
  type Cell = {
    trueKey: string;
    isControl: boolean;
    promptIdx: number;
    sample: number;
    text: string;
  };
  const cells: Cell[] = [];
  const tasks: (() => Promise<void>)[] = [];
  for (let pi = 0; pi < personas.length; pi++) {
    const voice = realRender((personas[pi] as (typeof personas)[number]).soul).text;
    for (let p = 0; p < prompts.length; p++) {
      for (let k = 0; k < K; k++) {
        tasks.push(async () => {
          const text = await collector.collect({
            userPrompt: `${voice}\n\n${prompts[p]}`,
            arm: `ID-${(personas[pi] as (typeof personas)[number]).id}`,
            sample: k,
          });
          cells.push({
            trueKey: (personas[pi] as (typeof personas)[number]).id,
            isControl: false,
            promptIdx: p,
            sample: k,
            text,
          });
        });
      }
    }
  }
  for (let p = 0; p < prompts.length; p++) {
    for (let k = 0; k < K; k++) {
      tasks.push(async () => {
        const text = await collector.collect({
          userPrompt: prompts[p] as string,
          arm: "B",
          sample: k,
        });
        cells.push({ trueKey: DEFAULT_KEY, isControl: true, promptIdx: p, sample: k, text });
      });
    }
  }
  console.log(`\nCollecting ${tasks.length} responses (${CONCURRENCY}-wide)…`);
  await mapLimit(tasks, CONCURRENCY, (t) => t());
  console.log(`  responses done — ${collector.calls} call(s), ${collector.hits} hit(s).`);

  // ── Identify each response (blind N+1 line-up). ──
  const picks = new Map<Cell, string>();
  console.log(`Identifying ${cells.length} responses…`);
  await mapLimit(cells, CONCURRENCY, async (c, i) => {
    picks.set(c, await identifyPersona(judge, c.text, candidates, i + 1));
  });

  // ── Score: per-persona accuracy + confusion matrix. ──
  const keys = [...personas.map((p) => p.id), DEFAULT_KEY];
  const acc = (pred: (c: Cell) => boolean) => {
    const subset = cells.filter(pred);
    const correct = subset.filter((c) => picks.get(c) === c.trueKey).length;
    return { correct, total: subset.length, rate: subset.length ? correct / subset.length : 0 };
  };
  const perPersona = personas.map((p) => ({
    id: p.id,
    tier: p.tier,
    l2: p.l2,
    ...acc((c) => c.trueKey === p.id),
  }));
  const control = acc((c) => c.isControl);
  const perTier = (["near", "middle", "extreme"] as const).map((t) => ({
    tier: t,
    ...acc((c) => !c.isControl && personas.find((p) => p.id === c.trueKey)?.tier === t),
  }));

  // Confusion matrix: rows = true key (+default), cols = picked key (+default +"?").
  const cols = [...keys, "?"];
  const confusion: Record<string, Record<string, number>> = {};
  for (const rk of keys) {
    confusion[rk] = Object.fromEntries(cols.map((ck) => [ck, 0]));
  }
  for (const c of cells) {
    const row = confusion[c.trueKey] as Record<string, number>;
    const pk = picks.get(c) ?? "?";
    row[pk] = (row[pk] ?? 0) + 1;
  }

  // Distinctiveness threshold: smallest L2 whose persona is identified reliably (rate ≥ 0.5 ≫ chance).
  const sorted = [...perPersona].sort((a, b) => a.l2 - b.l2);
  const threshold = sorted.find((p) => p.rate >= 0.5);

  const overall = acc((c) => !c.isControl);
  // MEAN per tier (not max — max cherry-picks one persona and can fake a gradient).
  const tierMean = (t: string) => {
    const xs = perPersona.filter((p) => p.tier === t).map((p) => p.rate);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  const extremeMean = tierMean("extreme");
  const nearMean = tierMean("near");
  // Response bias: the single most-predicted option across ALL responses (incl. controls).
  const pickCounts = new Map<string, number>();
  for (const c of cells) {
    const pk = picks.get(c) ?? "?";
    pickCounts.set(pk, (pickCounts.get(pk) ?? 0) + 1);
  }
  const modal = [...pickCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["?", 0];
  const modalShare = modal[1] / cells.length;
  const thr = threshold
    ? `L2 ${r3(threshold.l2)} (${threshold.id})`
    : ">all tested (none cleared 0.5)";

  // Honest, chance-aware verdict. "Graded fidelity" requires the overall signal to clear chance with
  // margin AND no single option dominating the judge's picks (bias) AND extreme-mean > near-mean.
  const clearsChance = overall.rate > chance * 1.5;
  const biased = modalShare > 0.4;
  const verdict = biased
    ? `PROBE BIAS / NEAR-CHANCE — overall ${r3(overall.rate)} vs chance ${r3(chance)}; the judge collapses onto "${modal[0]}" (${Math.round(modalShare * 100)}% of all picks) and never reliably uses "default" (control→default ${r3(control.rate)}). The ${candidates.length}-way line-up does NOT recover graded identity — it does not replicate the clean 2-way result. See confusion matrix.`
    : clearsChance && extremeMean > nearMean
      ? `GRADED FIDELITY — overall ${r3(overall.rate)} > chance ${r3(chance)}; extreme-tier mean ${r3(extremeMean)} > near-tier mean ${r3(nearMean)}; reliable-identification threshold ≈ ${thr}.`
      : `NEAR-CHANCE — overall ${r3(overall.rate)} ≈ chance ${r3(chance)} (extreme-mean ${r3(extremeMean)}, near-mean ${r3(nearMean)}); the probe does not recover identity in an ${candidates.length}-way line-up.`;

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        armModel: collector.model,
        judgeModel: "haiku",
        k: K,
        chance,
        personas: personas.map((p) => ({
          id: p.id,
          tier: p.tier,
          alpha: p.alpha,
          l2: p.l2,
          description: p.description,
        })),
        perPersona,
        perTier,
        control,
        overall,
        confusion,
        threshold: threshold ? { id: threshold.id, l2: threshold.l2 } : null,
        verdict,
      },
      null,
      2,
    ),
  );

  // ── Summary ──
  console.log("\n──────── IDENTIFICATION vs DISTANCE ────────");
  console.log(`chance = ${r3(chance)}   (N+1 = ${candidates.length} options)`);
  for (const p of [...perPersona].sort((a, b) => a.l2 - b.l2)) {
    console.log(
      `  ${p.id.padEnd(16)} L2=${r3(p.l2)}  acc=${p.correct}/${p.total}=${r3(p.rate)}  [${p.tier}]`,
    );
  }
  console.log(`\nby tier:  ${perTier.map((t) => `${t.tier} ${r3(t.rate)}`).join("   ")}`);
  console.log(`control (→default): ${control.correct}/${control.total}=${r3(control.rate)}`);
  console.log(`overall souled: ${overall.correct}/${overall.total}=${r3(overall.rate)}`);
  console.log("\nConfusion (row=true, col=picked):");
  const header = ["true\\pick", ...cols].map((s) => s.slice(0, 9).padEnd(10)).join("");
  console.log(`  ${header}`);
  for (const rk of keys) {
    const row = confusion[rk] as Record<string, number>;
    const line = [rk, ...cols.map((ck) => String(row[ck] ?? 0))]
      .map((s) => s.slice(0, 9).padEnd(10))
      .join("");
    console.log(`  ${line}`);
  }
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`wrote ${OUT_PATH} — next: IDENT-FINDINGS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
