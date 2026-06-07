/**
 * @saulene/harness — the LIVE run (real renderer + real LLM judge). Dev-only.
 *
 * Run (subscription — default, no API key, uses this machine's Claude Code auth):
 *   pnpm --filter @saulene/harness run live
 * Run (SDK — billed):
 *   SAULENE_JUDGE_BACKEND=sdk ANTHROPIC_API_KEY=… pnpm --filter @saulene/harness run live
 *
 * This is the project's central-bet measurement: point the harness at `@saulene/renderer`'s real
 * `render` and a real Haiku-backed `realJudge`, run all five metrics over replayed synthetic
 * lifetimes, and write every raw number to `.live-run.json`. Threshold calibration (`calibrate.ts`)
 * then reasons over that file with ZERO further model calls.
 *
 * GATING: kept out of `pnpm test` (no `.test.ts`), so CI never makes a live call. The SDK backend
 * additionally requires `ANTHROPIC_API_KEY` (prints how-to and exits 0 when absent).
 */

import { writeFileSync } from "node:fs";
import { ASPECTS, type Soul, seedFromEntropy } from "@saulene/core";
import type { LlmClient } from "@saulene/perception";
import { RENDERER_VERSION, render as realRender } from "@saulene/renderer";
import { type Trajectory, block, entropyFromInt, lifetime, script } from "@saulene/simulator";
import { runHarness } from "./index.js";
import type { Judge } from "./judge.js";
import { realJudge } from "./judge.js";
import { LIVE_RUN_PATH, type LiveRunArtifact } from "./live-artifact.js";
import { AnthropicJudgeClient, ClaudeCliClient } from "./llm.js";
import type { RenderFn } from "./render.js";

/** ~Snapshots embedded per stage for the silhouette metric — keeps the paid/CLI run tractable. */
const SILHOUETTE_PER_STAGE = 8;
/** Parallel `claude -p` spawns during the cache-warm pre-pass (the slow CLI backend is one-at-a-time per call). */
const WARM_CONCURRENCY = 6;

/** Adapt the renderer's `(soul, opts?) → injection` to the harness `RenderFn` (drops `voiceBlock`). */
const render: RenderFn = (soul: Soul) => realRender(soul);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Reconstruct a renderable soul at a trajectory snapshot — must match `metrics.ts`'s `soulAt`. */
function soulAt(birth: Soul, v: Soul["v"], mp: number): Soul {
  return { ...birth, v: { ...v }, mp };
}

/** Even per-stage subsample — must match `stageSilhouette`'s subsample so the warmed text hits cache. */
function silhouetteSnaps(traj: Trajectory, maxPerStage: number): Trajectory["snapshots"] {
  const byStage = new Map<string, Trajectory["snapshots"]>();
  for (const snap of traj.snapshots) {
    const arr = byStage.get(snap.stage) ?? [];
    arr.push(snap);
    byStage.set(snap.stage, arr);
  }
  const kept: Trajectory["snapshots"] = [];
  for (const arr of byStage.values()) {
    const k = Math.min(maxPerStage, arr.length);
    for (let i = 0; i < k; i++) {
      kept.push(
        arr[Math.round((i * (arr.length - 1)) / Math.max(1, k - 1))] as (typeof arr)[number],
      );
    }
  }
  return kept;
}

/** Even subsample for trajectory — must match `trajectory`'s `picks` so the warmed text hits cache. */
function trajectorySnaps(traj: Trajectory): Trajectory["snapshots"] {
  const snaps = traj.snapshots;
  if (snaps.length === 0) return [];
  const k = Math.min(Math.min(12, snaps.length), snaps.length);
  const out: Trajectory["snapshots"] = [];
  for (let i = 0; i < k; i++) {
    out.push(
      snaps[Math.round((i * (snaps.length - 1)) / Math.max(1, k - 1))] as (typeof snaps)[number],
    );
  }
  return out;
}

/** Run `fn` over `items` at most `limit` at a time. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<unknown>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx] as T);
    }
  });
  await Promise.all(workers);
}

/**
 * Pre-warm the judge cache for every `embed` text the run will need, IN PARALLEL. The metric loops
 * await sequentially; the slow CLI backend makes that ~20s/call. By firing all embed texts through a
 * concurrency pool first, the metrics then hit a warm cache and return instantly. The texts here
 * mirror the metric internals exactly (`soulAt`, the silhouette/trajectory subsamples, the ablation
 * ±deltas) — any mismatch is harmless (it just falls back to a sequential call). Recovery/author
 * prompts use other methods and stay sequential (only 8 of them).
 */
async function warmEmbedCache(judge: Judge, souls: Soul[], traj: Trajectory): Promise<void> {
  const texts = new Set<string>();
  // Voice-separation + the soul-level embeds.
  for (const s of souls) texts.add(render(s).text);
  // Trajectory + silhouette snapshots.
  for (const snap of trajectorySnaps(traj))
    texts.add(render(soulAt(traj.birth, snap.v, snap.mp)).text);
  for (const snap of silhouetteSnaps(traj, SILHOUETTE_PER_STAGE))
    texts.add(render(soulAt(traj.birth, snap.v, snap.mp)).text);
  // Ablation on souls[0]: base + each aspect at ±0.05/±0.10 (matches `ablation`'s default deltas).
  const soul0 = souls[0] as Soul;
  texts.add(render(soul0).text);
  for (const aspect of ASPECTS) {
    for (const delta of [-0.1, -0.05, 0.05, 0.1]) {
      const v = { ...soul0.v, [aspect]: clamp01(soul0.v[aspect] + delta) };
      texts.add(render({ ...soul0, v }).text);
    }
  }
  await mapLimit([...texts], WARM_CONCURRENCY, (t) => judge.embed(t));
}

/** Pick the judge backend. Default: subscription CLI (no key). `SAULENE_JUDGE_BACKEND=sdk` → billed SDK. */
function makeClient(): (LlmClient & { model: string; calls: number; hits: number }) | null {
  const backend = (process.env.SAULENE_JUDGE_BACKEND ?? "cli").toLowerCase();
  if (backend === "sdk") {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log(
        "SAULENE_JUDGE_BACKEND=sdk needs ANTHROPIC_API_KEY (billed).\n" +
          "Either set the key, or use the default subscription backend: drop SAULENE_JUDGE_BACKEND.",
      );
      return null;
    }
    return new AnthropicJudgeClient();
  }
  return new ClaudeCliClient(); // subscription — this machine's Claude Code auth, no per-call billing
}

async function main(): Promise<void> {
  const client = makeClient();
  if (!client) return;

  const soulCount = 4;
  const seeds = [1, 2, 3, 4];
  const souls: Soul[] = seeds.map((n) => seedFromEntropy(entropyFromInt(n), 0));

  // References for the cross-soul line-up: same souls, same render → same soulHash ids runHarness uses.
  const references = souls.map((s) => {
    const r = render(s);
    return [r.soulHash, r.text] as const;
  });

  const judge = realJudge(client, { references });

  console.log(
    `Live harness run — model=${client.model}, souls=${soulCount}, silhouette≈${SILHOUETTE_PER_STAGE}/stage.`,
  );

  // Cache-warm pass: embed every text the metrics will need, in parallel, so the sequential metric
  // loops then hit a warm cache. Rebuild the SAME default trajectory runHarness builds internally
  // (lifetime(entropyFromInt(seeds[0]), defaultLifetimeScript())).
  const warmTraj = lifetime(
    entropyFromInt(seeds[0] as number),
    script(
      block({
        aspects: ["openness", "intellect"],
        practice: 0.8,
        fit: 0.6,
        significance: 0.5,
        count: 300,
      }),
    ),
  );
  console.log(`Warming embed cache (${WARM_CONCURRENCY}-wide)…`);
  await warmEmbedCache(judge, souls, warmTraj);
  console.log(`  warm done — ${client.calls} call(s), ${client.hits} hit(s). Running metrics…`);

  const report = await runHarness(render, judge, {
    soulCount,
    seeds,
    maxSilhouettePerStage: SILHOUETTE_PER_STAGE,
  });

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
