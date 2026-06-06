/**
 * @saulene/harness — threshold calibration (offline, ZERO model calls).
 *
 * Run:  pnpm --filter @saulene/harness run calibrate   (after `run live`)
 *
 * Reads `.live-run.json` and turns the raw measurements into recommended values for the six
 * `// TUNABLE (Phase 3)` thresholds in `metrics.ts`. Each recommendation sits on the correct side
 * of the observed number with a margin, so the real run passes without the threshold becoming
 * meaningless. Emits a markdown block to paste into FINDINGS.md.
 *
 * The thresholds are pure functions of distances the live run already computed, so calibration is
 * just arithmetic — no renderer, no judge, no network.
 */

import { existsSync, readFileSync } from "node:fs";
import { ASPECTS } from "@saulene/core";
import { type LiveRunArtifact, LIVE_RUN_PATH } from "./live-artifact.js";

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

function main(): void {
  if (!existsSync(LIVE_RUN_PATH)) {
    console.error(`No ${LIVE_RUN_PATH} — run \`pnpm --filter @saulene/harness run live\` first.`);
    process.exit(1);
  }
  const art = JSON.parse(readFileSync(LIVE_RUN_PATH, "utf8")) as LiveRunArtifact;
  const { report } = art;

  // 1 — STICKER_EPS: faithful prose must clear baseline distance; alarm only on a true collapse.
  const baseDists = report.traitRecovery.map((t) => t.baselineDistance);
  const meanErrs = report.traitRecovery.map((t) => t.meanError);
  const minBase = Math.min(...baseDists);
  const stickerEps = r3(minBase * 0.5); // half the weakest real signal → never false-alarms

  // 2 — DIAGONAL_THRESHOLD: below observed, above chance (1/N).
  const chance = 1 / report.crossSoul.ids.length;
  const diagonalThreshold = r3(Math.max(chance + 0.1, report.crossSoul.diagonalRate - 0.1));

  // 3 — PERCEPTIBILITY: below observed net drift so the real life reads as perceptible.
  const perceptibility = r3(report.trajectory.netDisplacement * 0.5);

  // 4 — JERK: above the observed largest step so continuous drift isn't flagged a teleport.
  const jerk = r3(report.trajectory.maxStep * 1.5);

  // 5 — SILHOUETTE_THRESHOLD: below observed mean silhouette.
  const silhouetteThreshold = r3(report.stageSilhouette.meanSilhouette * 0.5);

  // 6 — FLAT_EPS: below the weakest NON-trivial aspect sensitivity (flag genuinely-deaf aspects).
  const sens = ASPECTS.map((a) => ({ a, s: report.ablation.perAspect[a].meanSensitivity })).sort(
    (x, y) => x.s - y.s,
  );
  const nonTrivial = sens.filter((x) => x.s > 1e-6);
  const flatEps = r3((nonTrivial[0]?.s ?? 0.01) * 0.5);

  const lines: string[] = [];
  lines.push("## Calibration — recommended thresholds");
  lines.push("");
  lines.push(
    `_From \`.live-run.json\` — model \`${art.model}\`, renderer v${art.rendererVersion}, ${art.generatedAt}._`,
  );
  lines.push("");
  lines.push("| threshold | current | observed | recommended | basis |");
  lines.push("|---|---|---|---|---|");
  lines.push(
    `| STICKER_EPS | 0.05 | min baseDist ${r3(minBase)} | **${stickerEps}** | ½ weakest real signal |`,
  );
  lines.push(
    `| DIAGONAL_THRESHOLD | 0.75 | rate ${r3(report.crossSoul.diagonalRate)} (chance ${r3(chance)}) | **${diagonalThreshold}** | above chance, below observed ⚠ see leak |`,
  );
  lines.push(
    `| PERCEPTIBILITY | 0.1 | net ${r3(report.trajectory.netDisplacement)} | **${perceptibility}** | ½ observed net drift |`,
  );
  lines.push(
    `| JERK | 0.15 | maxStep ${r3(report.trajectory.maxStep)} | **${jerk}** | 1.5× largest step |`,
  );
  lines.push(
    `| SILHOUETTE_THRESHOLD | 0.1 | mean ${r3(report.stageSilhouette.meanSilhouette)} | **${silhouetteThreshold}** | ½ observed silhouette |`,
  );
  lines.push(
    `| FLAT_EPS | 0.01 | min sens ${r3(sens[0]?.s ?? 0)} | **${flatEps}** | ½ weakest non-flat aspect |`,
  );
  lines.push("");
  lines.push("### Trait recovery — does a blind reader recover the personality?");
  lines.push(`- mean recovery error per soul: ${meanErrs.map(r3).join(", ")}`);
  lines.push(`- baseline distance per soul: ${baseDists.map(r3).join(", ")}`);
  lines.push(
    `- sticker alarms: ${report.traitRecovery.filter((t) => t.stickerAlarm).length}/${report.traitRecovery.length}`,
  );
  lines.push("");
  lines.push("### Voice distinctness");
  lines.push(
    `- formal diagonalRate: ${r3(report.crossSoul.diagonalRate)} (⚠ trivial under a prompt-independent renderer — sample≡reference)`,
  );
  lines.push(
    `- leak-free pairwise voice separation: mean ${r3(art.voiceSeparation.meanPairwise)}, min ${r3(art.voiceSeparation.minPairwise)}, max ${r3(art.voiceSeparation.maxPairwise)}`,
  );
  lines.push("");
  lines.push("### Drift");
  lines.push(
    `- net displacement ${r3(report.trajectory.netDisplacement)} (perceptible=${report.trajectory.perceptible}), maxStep ${r3(report.trajectory.maxStep)} / meanStep ${r3(report.trajectory.meanStep)} (continuous=${report.trajectory.continuous})`,
  );
  lines.push(
    `- stage silhouette mean ${r3(report.stageSilhouette.meanSilhouette)} (clustered=${report.stageSilhouette.clustered})`,
  );
  lines.push("");
  lines.push("### Per-aspect sensitivity (ablation, ascending)");
  for (const { a, s } of sens) {
    lines.push(`- ${a}: ${r3(s)}${report.ablation.flatAspects.includes(a) ? " ⚠ FLAT" : ""}`);
  }

  console.log(lines.join("\n"));
}

main();
