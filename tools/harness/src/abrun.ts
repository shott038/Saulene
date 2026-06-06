/**
 * @saulene/harness — A/B behavioral validation run (Phase 2). Dev-only, subscription-only.
 *
 * Run:  pnpm --filter @saulene/harness run ab
 *
 * The proof-of-life experiment: does the ul injection causally shift the MODEL'S BEHAVIOR toward the
 * target personality, vs the same model with no injection? Two arms (treatment = render(soul) in the
 * system prompt; control = none), judged blind on their RESPONSES (not the injection) by
 * `recoverTraits`. Lift = dist(r_B, target) − dist(r_A, target): positive ⇒ the plugin moved
 * behavior toward the target relative to the EMPIRICAL base-Claude persona r_B (which replaces the
 * assumed 0.5 BASELINE). A lift ≈ 0 is the falsifiable null and is reported plainly.
 *
 * Subscription-only (no API key); everything caches; never in CI. See docs/ab-validation-plan.md.
 */

import { writeFileSync } from "node:fs";
import { ASPECTS, type AspectVector, type Soul, type Stage, seedFromEntropy } from "@saulene/core";
import { render as realRender } from "@saulene/renderer";
import { type Trajectory, block, entropyFromInt, lifetime, script } from "@saulene/simulator";
import { ResponseCollector } from "./ab-collect.js";
import { AB_BATTERY } from "./battery.js";
import { realJudge } from "./judge.js";
import { ClaudeCliClient } from "./llm.js";

// ── Run config (env-overridable; modest defaults for the first subscription run) ──────────────
const SOUL_SEEDS = (process.env.AB_SOULS ?? "1,2,3,4").split(",").map((s) => Number(s.trim()));
const K = Number(process.env.AB_K ?? 3); // samples/prompt → the variance for the CI
const INCLUDE_STAGES = (process.env.AB_STAGES ?? "1") !== "0"; // young/adult/old snapshots of soul #1
const CONCURRENCY = Number(process.env.AB_CONCURRENCY ?? 6);
const OUT_PATH = ".ab-run.json";

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (t: T, i: number) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i] as T, i);
      }
    }),
  );
}

/** Mean per-aspect L1 distance — the same shape `metrics.ts` uses. */
function dist(a: AspectVector, b: AspectVector): number {
  let s = 0;
  for (const x of ASPECTS) s += Math.abs(a[x] - b[x]);
  return s / ASPECTS.length;
}

function meanVec(vs: AspectVector[]): AspectVector {
  const out = {} as AspectVector;
  for (const a of ASPECTS) out[a] = vs.reduce((s, v) => s + v[a], 0) / (vs.length || 1);
  return out;
}

function stats(xs: number[]): { mean: number; sd: number; ci95: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, sd: 0, ci95: 0, n: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, sd, ci95: (1.96 * sd) / Math.sqrt(n), n };
}

const r3 = (x: number): number => Math.round(x * 1000) / 1000;
const soulAt = (birth: Soul, v: AspectVector, mp: number): Soul => ({ ...birth, v: { ...v }, mp });

// ── Subjects: distinct souls + young/adult/old stage snapshots ─────────────────────────────────
interface Subject {
  id: string;
  soul: Soul;
  target: AspectVector;
  injection: string;
}

function buildSubjects(): Subject[] {
  const subs: Subject[] = [];
  for (const seed of SOUL_SEEDS) {
    const soul = seedFromEntropy(entropyFromInt(seed), 0);
    subs.push({ id: `soul${seed}`, soul, target: soul.v, injection: realRender(soul).text });
  }
  if (INCLUDE_STAGES) {
    const traj: Trajectory = lifetime(
      entropyFromInt(SOUL_SEEDS[0] as number),
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
    const want: [Stage, string][] = [
      ["childhood", "young"],
      ["early_adulthood", "adult"],
      ["old_adulthood", "old"],
    ];
    for (const [stage, label] of want) {
      const snap = traj.snapshots.find((s) => s.stage === stage);
      if (!snap) continue;
      const soul = soulAt(traj.birth, snap.v, snap.mp);
      subs.push({
        id: `soul${SOUL_SEEDS[0]}@${label}`,
        soul,
        target: snap.v,
        injection: realRender(soul).text,
      });
    }
  }
  return subs;
}

// ── The run ─────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const subjects = buildSubjects();
  const prompts = AB_BATTERY.prompts;
  const collector = new ResponseCollector();
  const judgeClient = new ClaudeCliClient({ cachePath: ".judge-cache.json" });
  const judge = realJudge(judgeClient, {});

  console.log(
    `A/B run — arms=${collector.model}, judge=haiku, subjects=${subjects.length}, prompts=${prompts.length}, k=${K}.`,
  );

  // Phase 1 — collect responses (parallel). Control (Arm B) is soul-independent: collect once.
  type RespCell = {
    kind: "control" | "treat";
    subjectIdx: number;
    promptIdx: number;
    sample: number;
    text: string;
  };
  const cells: RespCell[] = [];
  const tasks: (() => Promise<void>)[] = [];
  for (let p = 0; p < prompts.length; p++) {
    for (let k = 0; k < K; k++) {
      tasks.push(async () => {
        const text = await collector.collect({
          userPrompt: prompts[p] as string,
          arm: "B",
          sample: k,
        });
        cells.push({ kind: "control", subjectIdx: -1, promptIdx: p, sample: k, text });
      });
    }
  }
  for (let si = 0; si < subjects.length; si++) {
    for (let p = 0; p < prompts.length; p++) {
      for (let k = 0; k < K; k++) {
        tasks.push(async () => {
          const text = await collector.collect({
            userPrompt: prompts[p] as string,
            systemAppend: (subjects[si] as Subject).injection,
            arm: "A",
            sample: k,
          });
          cells.push({ kind: "treat", subjectIdx: si, promptIdx: p, sample: k, text });
        });
      }
    }
  }
  console.log(`Collecting ${tasks.length} responses (${CONCURRENCY}-wide)…`);
  await mapLimit(tasks, CONCURRENCY, (t) => t());
  console.log(`  responses done — ${collector.calls} call(s), ${collector.hits} hit(s).`);

  // Phase 2 — judge the RESPONSES (recoverTraits), blind. Parallel.
  const judged = new Map<RespCell, AspectVector>();
  console.log(`Judging ${cells.length} responses…`);
  await mapLimit(cells, CONCURRENCY, async (c) => {
    judged.set(c, (await judge.recoverTraits(c.text)) as AspectVector);
  });

  // r_B = empirical base-Claude persona (mean over all control recoveries) — replaces the 0.5 BASELINE.
  const controlVecs = cells
    .filter((c) => c.kind === "control")
    .map((c) => judged.get(c) as AspectVector);
  const rB = meanVec(controlVecs);

  // Phase 3 — lift, per subject + per aspect + CI.
  const perSubject = subjects.map((subj, si) => {
    const treat = cells.filter((c) => c.kind === "treat" && c.subjectIdx === si);
    const vecs = treat.map((c) => judged.get(c) as AspectVector);
    const rA = meanVec(vecs);
    const distA = dist(rA, subj.target);
    const distB = dist(rB, subj.target);
    // CI from per-response lift (r_B held fixed; treatment-side variance).
    const liftSamples = vecs.map((v) => distB - dist(v, subj.target));
    const st = stats(liftSamples);
    const perAspect = {} as AspectVector;
    for (const a of ASPECTS)
      perAspect[a] = Math.abs(rB[a] - subj.target[a]) - Math.abs(rA[a] - subj.target[a]);
    return {
      id: subj.id,
      rA,
      distA,
      distB,
      lift: distB - distA,
      ci95: st.ci95,
      n: st.n,
      perAspect,
      target: subj.target,
    };
  });

  const aggLift = stats(perSubject.map((s) => s.lift));
  const aggPerAspect = {} as AspectVector;
  for (const a of ASPECTS)
    aggPerAspect[a] = perSubject.reduce((s, x) => s + x.perAspect[a], 0) / perSubject.length;

  // Slice lift by prompt class — the key confound check: self-report (prompts 0–1) OVER-elicits
  // personality; neutral tasks (2+) are the honest probe. Pooled over all treat responses in the
  // class (subject × prompt × sample), r_B held fixed against each subject's target.
  const SELF_REPORT_COUNT = 2;
  // Per subject, denoise BOTH sides (mean r_A over that subject's in-class responses vs the mean
  // r_B), then aggregate the per-subject lifts — apples-to-apples with the headline aggregate. (A
  // per-response pool would compare a noisy single response against the denoised r_B and bias
  // negative via Jensen's inequality — a method artifact, not a real effect.)
  const sliceLift = (pred: (promptIdx: number) => boolean) => {
    const perSubj: number[] = [];
    for (let si = 0; si < subjects.length; si++) {
      const target = (subjects[si] as Subject).target;
      const vecs = cells
        .filter((c) => c.kind === "treat" && c.subjectIdx === si && pred(c.promptIdx))
        .map((c) => judged.get(c) as AspectVector);
      if (vecs.length === 0) continue;
      perSubj.push(dist(rB, target) - dist(meanVec(vecs), target));
    }
    return stats(perSubj);
  };
  const liftSelfReport = sliceLift((p) => p < SELF_REPORT_COUNT);
  const liftTask = sliceLift((p) => p >= SELF_REPORT_COUNT);

  // Phase 4 — distinguishability.
  // (a) 2-arm: pick which of two responses (treatment vs control) shows a distinct personality.
  let twoArmCorrect = 0;
  let twoArmTotal = 0;
  const twoArmTasks: (() => Promise<void>)[] = [];
  for (let si = 0; si < subjects.length; si++) {
    for (let p = 0; p < prompts.length; p++) {
      twoArmTasks.push(async () => {
        const aTxt = cells.find(
          (c) => c.kind === "treat" && c.subjectIdx === si && c.promptIdx === p && c.sample === 0,
        )?.text;
        const bTxt = cells.find(
          (c) => c.kind === "control" && c.promptIdx === p && c.sample === 0,
        )?.text;
        if (!aTxt || !bTxt) return;
        const treatFirst = (si + p) % 2 === 0; // deterministic blinding of slot order
        const first = treatFirst ? aTxt : bTxt;
        const second = treatFirst ? bTxt : aTxt;
        const pick = await pickPersonality(judgeClient, prompts[p] as string, first, second);
        twoArmTotal++;
        if ((pick === "A" && treatFirst) || (pick === "B" && !treatFirst)) twoArmCorrect++;
      });
    }
  }
  console.log(`Distinguishability (2-arm) — ${twoArmTasks.length} comparisons…`);
  await mapLimit(twoArmTasks, CONCURRENCY, (t) => t());

  // (b) line-up with a NO-PLUGIN candidate. Leak-free: target = a subject's treatment response at
  // sample 1; references = every subject's treatment response at sample 0 + one control (no-plugin)
  // response. Can the judge attribute the souled voice — and avoid the stock-Claude candidate?
  let lineupSelf = 0;
  let lineupControl = 0;
  let lineupTotal = 0;
  const refLetters = [...subjects.map((_, i) => String.fromCharCode(65 + i)), "Z"]; // Z = no-plugin
  const controlRef = cells.find(
    (c) => c.kind === "control" && c.promptIdx === 0 && c.sample === 0,
  )?.text;
  if (K >= 2 && controlRef) {
    const lineupTasks = subjects.map((_subj, si) => async () => {
      const target = cells.find(
        (c) => c.kind === "treat" && c.subjectIdx === si && c.promptIdx === 1 && c.sample === 1,
      )?.text;
      if (!target) return;
      const refs = subjects.map(
        (_s, j) =>
          cells.find(
            (c) => c.kind === "treat" && c.subjectIdx === j && c.promptIdx === 0 && c.sample === 0,
          )?.text ?? "",
      );
      const pick = await pickAuthor(judgeClient, target, [...refs, controlRef], refLetters);
      lineupTotal++;
      if (pick === refLetters[si]) lineupSelf++;
      if (pick === "Z") lineupControl++;
    });
    console.log(`Distinguishability (line-up + no-plugin) — ${lineupTasks.length}…`);
    await mapLimit(lineupTasks, CONCURRENCY, (t) => t());
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    armModel: collector.model,
    judgeModel: "haiku",
    battery: AB_BATTERY,
    k: K,
    subjects: subjects.map((s) => s.id),
    rB,
    perSubject,
    aggregate: { lift: aggLift, perAspect: aggPerAspect },
    bySlice: { selfReport: liftSelfReport, task: liftTask },
    twoArm: {
      correct: twoArmCorrect,
      total: twoArmTotal,
      rate: twoArmTotal ? twoArmCorrect / twoArmTotal : 0,
    },
    lineup: {
      total: lineupTotal,
      selfRate: lineupTotal ? lineupSelf / lineupTotal : 0,
      controlPickRate: lineupTotal ? lineupControl / lineupTotal : 0,
    },
    counts: { responseCalls: collector.calls, responseHits: collector.hits },
  };
  writeFileSync(OUT_PATH, JSON.stringify(artifact, null, 2));

  // ── Summary ─────────────────────────────────────────────────────────────────────────────────
  console.log(`\n✓ A/B run complete — wrote ${OUT_PATH}\n`);
  console.log("Empirical base-Claude persona r_B (vs assumed 0.5):");
  console.log(`  ${ASPECTS.map((a) => `${a}=${r3(rB[a])}`).join("  ")}`);
  console.log("\nLift per subject (dist(r_B,target) − dist(r_A,target); + = moved toward target):");
  for (const s of perSubject) {
    console.log(
      `  ${s.id.padEnd(14)} lift=${r3(s.lift) >= 0 ? " " : ""}${r3(s.lift)} ±${r3(s.ci95)}  (distB=${r3(s.distB)} → distA=${r3(s.distA)})`,
    );
  }
  console.log(
    `\nAGGREGATE lift = ${r3(aggLift.mean)} ± ${r3(aggLift.ci95)} (95% CI, n=${aggLift.n} subjects)`,
  );
  console.log(
    `  self-report prompts: ${r3(liftSelfReport.mean)} ± ${r3(liftSelfReport.ci95)} (n=${liftSelfReport.n})  |  task prompts: ${r3(liftTask.mean)} ± ${r3(liftTask.ci95)} (n=${liftTask.n})`,
  );
  console.log(
    `2-arm distinguishability: ${twoArmCorrect}/${twoArmTotal} = ${r3(artifact.twoArm.rate)} picked the souled arm (0.5 = chance)`,
  );
  if (lineupTotal > 0) {
    console.log(
      `Line-up (+ no-plugin candidate): self-attribution ${r3(artifact.lineup.selfRate)}, picked the no-plugin candidate ${r3(artifact.lineup.controlPickRate)}`,
    );
  }
  console.log("\nPer-aspect aggregate lift (ascending):");
  for (const { a, v } of ASPECTS.map((a) => ({ a, v: aggPerAspect[a] })).sort(
    (x, y) => x.v - y.v,
  )) {
    console.log(`  ${a.padEnd(16)} ${r3(v) >= 0 ? " " : ""}${r3(v)}`);
  }
  console.log("\nNext: write the verdict into tools/harness/AB-FINDINGS.md");
}

/** Blind 2-arm judge call: which response (first=A / second=B) shows a more distinct personality? */
async function pickPersonality(
  client: ClaudeCliClient,
  request: string,
  first: string,
  second: string,
): Promise<"A" | "B" | "?"> {
  const prompt = [
    "Two assistant responses to the same request follow. One was written by an assistant given a ",
    "specific, distinctive personality; the other by a neutral default assistant. Decide which shows ",
    "the MORE distinctive, specific personality (voice, stance, temperament — not which is more ",
    `helpful). Reply with ONLY the single letter 'A' or 'B'.\n\nREQUEST: ${request}\n\n`,
    `[A]\n"""\n${first}\n"""\n\n[B]\n"""\n${second}\n"""`,
  ].join("");
  const reply = (await client.complete(prompt)).trim().toUpperCase();
  if (reply.startsWith("A")) return "A";
  if (reply.startsWith("B")) return "B";
  return "?";
}

/** Blind line-up: which candidate (by letter) shares the target's author/personality? */
async function pickAuthor(
  client: ClaudeCliClient,
  target: string,
  refs: string[],
  letters: string[],
): Promise<string> {
  const lineup = refs.map((t, i) => `[${letters[i]}]\n"""\n${t}\n"""`).join("\n\n");
  const prompt = [
    "A TARGET response, then several CANDIDATE responses each by a different author. Decide which ",
    "candidate was written by the same author/personality as the target — match on voice, stance, ",
    `and temperament, not topic. Reply with ONLY the single candidate letter (${letters.join(", ")}).\n\n`,
    `TARGET:\n"""\n${target}\n"""\n\nCANDIDATES:\n${lineup}`,
  ].join("");
  const reply = (await client.complete(prompt)).trim().toUpperCase();
  const hit = letters.find((L) => reply.startsWith(L) || reply === L);
  return hit ?? "?";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
