/**
 * @saulene/harness — Phase 5: clean 2-way-per-tier discrimination. Dev-only, subscription-only.
 *
 * Run:  pnpm --filter @saulene/harness run pairwise
 *
 * Phase 4's 7-way line-up was confounded (modal cold-bias + overlapping same-direction tiers). Phase
 * 5 strips it to a BALANCED BINARY: at each distance tier, pit cold@α vs warm@α and ask the blind
 * judge which of the TWO produced each response. Chance = 0.5. Reports accuracy three ways per tier —
 * combined / cold-true / warm-true — so genuine discrimination (combined ≫ 0.5) is separated from
 * pure modal bias (cold-true high, warm-true low, combined ≈ 0.5) and the warm/cold asymmetry is
 * exposed directly.
 *
 * Reuses the Phase-4 personas + their cached S1 responses (zero new response calls); only the 2-way
 * judge calls are fresh. arms=sonnet, judge=haiku, 6-prompt battery, k=3. Strict-MCP, no API key.
 */

import { writeFileSync } from "node:fs";
import { ASPECTS, type AspectVector } from "@saulene/core";
import { render as realRender } from "@saulene/renderer";
import { ResponseCollector } from "./ab-collect.js";
import { CONCURRENCY, K, mapLimit, r3, stats } from "./ab-core.js";
import { AB_BATTERY, EMOTIONAL_BATTERY } from "./battery.js";
import { type Persona, buildPersonaLadder } from "./ident-souls.js";
import { type Candidate, identifyPersona } from "./identify.js";
import { ClaudeCliClient } from "./llm.js";

// Battery select: AB_BATTERY_SET=emotional → Phase-6 emotional probe; else the Phase-5 neutral battery.
const EMOTIONAL = (process.env.AB_BATTERY_SET ?? "").toLowerCase() === "emotional";
const BATTERY = EMOTIONAL ? EMOTIONAL_BATTERY : AB_BATTERY;
const OUT_PATH = EMOTIONAL ? ".pairwise-emotional-run.json" : ".pairwise-run.json";
const TIERS = ["near", "middle", "extreme"] as const;

function l2(a: AspectVector, b: AspectVector): number {
  let s = 0;
  for (const x of ASPECTS) s += (a[x] - b[x]) ** 2;
  return Math.sqrt(s);
}

interface Cell {
  trueKey: "cold" | "warm";
  promptIdx: number;
  sample: number;
  text: string;
}

async function main(): Promise<void> {
  const personas = buildPersonaLadder();
  const byId = new Map(personas.map((p) => [p.id, p]));
  const prompts = BATTERY.prompts;
  const collector = new ResponseCollector(); // sonnet arms
  const judge = new ClaudeCliClient({ cachePath: ".judge-cache.json", model: "haiku" });

  console.log(
    `Pairwise discrimination — battery=${BATTERY.version}, arms=${collector.model}, judge=haiku, tiers=${TIERS.join("/")}, ${prompts.length} prompts, k=${K}, chance=0.5.`,
  );

  const results: {
    tier: string;
    alpha: number;
    pairSeparation: number;
    combined: ReturnType<typeof stats>;
    coldTrue: ReturnType<typeof stats>;
    warmTrue: ReturnType<typeof stats>;
    asymmetry: number;
  }[] = [];

  for (let ti = 0; ti < TIERS.length; ti++) {
    const tier = TIERS[ti] as string;
    const cold = byId.get(`cold-${tier}`) as Persona;
    const warm = byId.get(`warm-${tier}`) as Persona;
    const candidates: Candidate[] = [
      { key: "cold", description: cold.description },
      { key: "warm", description: warm.description },
    ];

    // Collect both souls' S1 responses — same arm labels as Phase 4 ⇒ cache hits, no new calls.
    const cells: Cell[] = [];
    const collectTasks: (() => Promise<void>)[] = [];
    for (const persona of [cold, warm]) {
      const voice = realRender(persona.soul).text;
      const trueKey: "cold" | "warm" = persona === cold ? "cold" : "warm";
      for (let p = 0; p < prompts.length; p++) {
        for (let k = 0; k < K; k++) {
          collectTasks.push(async () => {
            const text = await collector.collect({
              userPrompt: `${voice}\n\n${prompts[p]}`,
              arm: `ID-${persona.id}`,
              sample: k,
            });
            cells.push({ trueKey, promptIdx: p, sample: k, text });
          });
        }
      }
    }
    await mapLimit(collectTasks, CONCURRENCY, (t) => t());

    // 2-way identify each response (seeded shuffle ⇒ randomized A/B order, cache-stable).
    const picks = new Map<Cell, string>();
    await mapLimit(cells, CONCURRENCY, async (c) => {
      const seed = ti * 100000 + (c.trueKey === "cold" ? 0 : 50000) + c.promptIdx * 100 + c.sample;
      picks.set(c, await identifyPersona(judge, c.text, candidates, seed));
    });

    const score = (pred: (c: Cell) => boolean) =>
      cells.filter(pred).map((c) => (picks.get(c) === c.trueKey ? 1 : 0));
    const combined = stats(score(() => true));
    const coldTrue = stats(score((c) => c.trueKey === "cold"));
    const warmTrue = stats(score((c) => c.trueKey === "warm"));
    results.push({
      tier,
      alpha: cold.alpha,
      pairSeparation: l2(cold.v, warm.v),
      combined,
      coldTrue,
      warmTrue,
      asymmetry: coldTrue.mean - warmTrue.mean,
    });
    console.log(
      `  [${tier}] sep=${r3(l2(cold.v, warm.v))}  combined=${r3(combined.mean)}±${r3(combined.ci95)}  cold=${r3(coldTrue.mean)}  warm=${r3(warmTrue.mean)}`,
    );
  }

  // Threshold = first tier (by separation) whose combined accuracy clears 0.5 with CI.
  const bySep = [...results].sort((a, b) => a.pairSeparation - b.pairSeparation);
  const threshold = bySep.find((r) => r.combined.mean - r.combined.ci95 > 0.5);
  const asymmetric = results.every((r) => r.coldTrue.mean - r.warmTrue.mean > 0.2);
  const anyDiscriminates = results.some((r) => r.combined.mean - r.combined.ci95 > 0.5);
  const verdict = anyDiscriminates
    ? `GRADED + REAL — combined accuracy clears chance from separation ≈ ${threshold ? r3(threshold.pairSeparation) + ` (${threshold.tier})` : "—"}.${asymmetric ? " Cold≫warm at every tier — base-persona asymmetry confirmed as the dominant ceiling." : ""}`
    : `NO CLEAN DISCRIMINATION — even balanced 2-way combined accuracy never clears 0.5 with CI${asymmetric ? "; cold≫warm throughout (modal bias, not discrimination)" : ""}.`;

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        battery: BATTERY.version,
        armModel: collector.model,
        judgeModel: "haiku",
        k: K,
        results,
        threshold: threshold
          ? { tier: threshold.tier, pairSeparation: threshold.pairSeparation }
          : null,
        verdict,
      },
      null,
      2,
    ),
  );

  console.log("\n──────── PAIRWISE 2-WAY (cold@α vs warm@α) ────────");
  console.log("tier      pairSep   combined±CI       cold-true   warm-true   asym");
  for (const r of results) {
    console.log(
      `${r.tier.padEnd(9)} ${r3(r.pairSeparation).toString().padEnd(8)} ${`${r3(r.combined.mean)}±${r3(r.combined.ci95)}`.padEnd(16)} ${r3(r.coldTrue.mean).toString().padEnd(11)} ${r3(r.warmTrue.mean).toString().padEnd(11)} ${r3(r.asymmetry)}`,
    );
  }
  console.log(
    `\nchance = 0.5  (n=${results[0]?.combined.n ?? 0} combined / ${results[0]?.coldTrue.n ?? 0} per side, per tier)`,
  );
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`wrote ${OUT_PATH} — next: append Phase 5 to IDENT-FINDINGS.md`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
