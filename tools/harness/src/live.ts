/**
 * @saulene/harness — the LIVE run (real renderer + real LLM judge). Dev-only, costs money.
 *
 * Run:  ANTHROPIC_API_KEY=… pnpm --filter @saulene/harness run live
 *
 * This is the project's central-bet measurement: point the harness at `@saulene/renderer`'s real
 * `render` and a real Haiku-backed `realJudge`, run all five metrics over replayed synthetic
 * lifetimes, and write every raw number to `.live-run.json`. Threshold calibration (`calibrate.ts`)
 * then reasons over that file with ZERO further model calls.
 *
 * GATING: kept out of `pnpm test` (no `.test.ts`), so CI never makes a live call. If
 * `ANTHROPIC_API_KEY` is absent it prints how to run and exits 0 — never silently fakes a result.
 */

import { writeFileSync } from "node:fs";
import { type Soul, seedFromEntropy } from "@saulene/core";
import { RENDERER_VERSION, render as realRender } from "@saulene/renderer";
import { entropyFromInt } from "@saulene/simulator";
import { runHarness } from "./index.js";
import { realJudge } from "./judge.js";
import { type LiveRunArtifact, LIVE_RUN_PATH } from "./live-artifact.js";
import { AnthropicJudgeClient } from "./llm.js";
import type { RenderFn } from "./render.js";

/** Adapt the renderer's `(soul, opts?) → injection` to the harness `RenderFn` (drops `voiceBlock`). */
const render: RenderFn = (soul: Soul) => realRender(soul);

function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(
      "ANTHROPIC_API_KEY is not set — the live run makes real (paid) model calls and needs it.\n" +
        "Run:  ANTHROPIC_API_KEY=… pnpm --filter @saulene/harness run live\n" +
        "(results cache to .judge-cache.json, so a re-run / calibrate is free)",
    );
    return;
  }

  const soulCount = 4;
  const seeds = [1, 2, 3, 4];
  const souls: Soul[] = seeds.map((n) => seedFromEntropy(entropyFromInt(n), 0));

  // References for the cross-soul line-up: same souls, same render → same soulHash ids runHarness uses.
  const references = souls.map((s) => {
    const r = render(s);
    return [r.soulHash, r.text] as const;
  });

  const client = new AnthropicJudgeClient();
  const judge = realJudge(client, { references });

  console.log(
    `Live harness run — model=${client.model}, souls=${soulCount}. This makes paid calls…`,
  );
  const report = await runHarness(render, judge, { soulCount, seeds });

  // Leak-free voice separation: pairwise distance between the souls' injection embeddings.
  const embeds = await Promise.all(souls.map((s) => judge.embed(render(s).text)));
  const pairs: number[] = [];
  for (let i = 0; i < embeds.length; i++) {
    for (let j = i + 1; j < embeds.length; j++) {
      pairs.push(euclidean(embeds[i] as number[], embeds[j] as number[]));
    }
  }
  const meanPairwise = pairs.reduce((a, b) => a + b, 0) / (pairs.length || 1);

  const artifact: LiveRunArtifact = {
    generatedAt: new Date().toISOString(),
    model: client.model,
    rendererVersion: RENDERER_VERSION,
    seeds,
    modelCalls: client.calls,
    cacheHits: client.hits,
    report,
    voiceSeparation: {
      meanPairwise,
      minPairwise: Math.min(...pairs),
      maxPairwise: Math.max(...pairs),
    },
  };

  writeFileSync(LIVE_RUN_PATH, JSON.stringify(artifact, null, 2));

  // Headline summary.
  console.log(
    `\n✓ Live run complete — ${client.calls} model call(s), ${client.hits} cache hit(s).`,
  );
  console.log(`  wrote ${LIVE_RUN_PATH}\n`);
  console.log("Trait-recovery (per soul): meanError / baselineDistance / stickerAlarm");
  for (const tr of report.traitRecovery) {
    console.log(
      `  err=${tr.meanError.toFixed(3)}  baseDist=${tr.baselineDistance.toFixed(3)}  ${
        tr.stickerAlarm ? "⚠ STICKER" : "ok"
      }`,
    );
  }
  console.log(
    `Cross-soul diagonalRate=${report.crossSoul.diagonalRate.toFixed(3)} (distinct=${report.crossSoul.distinct})`,
  );
  console.log(
    `Voice separation (leak-free): mean=${meanPairwise.toFixed(3)} min=${Math.min(...pairs).toFixed(
      3,
    )} max=${Math.max(...pairs).toFixed(3)}`,
  );
  console.log(
    `Trajectory: net=${report.trajectory.netDisplacement.toFixed(3)} maxStep=${report.trajectory.maxStep.toFixed(
      3,
    )} perceptible=${report.trajectory.perceptible} continuous=${report.trajectory.continuous}`,
  );
  console.log(
    `Stage silhouette: mean=${report.stageSilhouette.meanSilhouette.toFixed(3)} clustered=${report.stageSilhouette.clustered}`,
  );
  console.log(
    `Ablation: flatAspects=[${report.ablation.flatAspects.join(", ")}] allMonotonic=${report.ablation.allMonotonic}`,
  );
  console.log("\nNext:  pnpm --filter @saulene/harness run calibrate");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
