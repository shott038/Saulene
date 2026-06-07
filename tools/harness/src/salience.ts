/**
 * @saulene/harness — Phase 3: the SALIENCE sweep. Dev-only, subscription-only.
 *
 * Run:  pnpm --filter @saulene/harness run salience
 *
 * Phase 2 found a behavioral NULL with the shipping mechanism (voice appended to Claude Code's
 * ~20k-token system prompt). Is that a DELIVERY problem (the voice is washed out) or a FOUNDATIONAL
 * one (the voice doesn't drive behavior even undiluted)? This sweeps how the SAME voice is delivered,
 * holding everything else constant (same souls, battery, k, control r_B, judge, metrics), and reads
 * the lift at each rung:
 *
 *   S0  append-to-system   `--append-system-prompt <voice>`     ← the Phase-2 null (cache-reused)
 *   S1  conversation       voice prepended into the user turn    (high-salience recent tokens)
 *   S2  channel+reinforce   S1 + a forceful embodiment directive  (emphasis knob, not a content edit)
 *   S3  CEILING (diag.)     `--system-prompt <voice>` full-replace (no 20k competition — disambiguator)
 *
 * Decision: ceiling (S3) clearly > 0 and lift rises with salience ⇒ delivery problem (report the first
 * shippable rung that clears its CI). Ceiling ≈ 0 ⇒ foundational (report plainly). All cached.
 */

import { writeFileSync } from "node:fs";
import { ASPECTS, type AspectVector } from "@saulene/core";
import { ResponseCollector } from "./ab-collect.js";
import {
  CONCURRENCY,
  K,
  SELF_REPORT_COUNT,
  type Subject,
  buildSubjects,
  dist,
  mapLimit,
  meanVec,
  pickPersonality,
  r3,
  stats,
} from "./ab-core.js";
import { AB_BATTERY } from "./battery.js";
import { realJudge } from "./judge.js";
import { ClaudeCliClient } from "./llm.js";

const OUT_PATH = ".salience-run.json";

/** S2's reinforcement wrapper — raises EMPHASIS only; never edits the renderer's voice content. */
const EMBODIMENT =
  "IMPORTANT — for this reply, fully embody the persona described below. This is who you ARE: let it " +
  "shape your tone, stance, and temperament, not just what you know about yourself. Stay in character.";

interface Rung {
  id: string;
  arm: string;
  /** Build the delivery for (voice, prompt). S0 reuses the Phase-2 arm label "A" → cache hit. */
  deliver: (
    voice: string,
    prompt: string,
  ) => { userPrompt: string; systemAppend?: string; systemReplace?: string };
  shippable: boolean;
  note: string;
}

const RUNGS: Rung[] = [
  {
    id: "S0",
    arm: "A",
    shippable: true,
    note: "append to system (shipping)",
    deliver: (v, p) => ({ userPrompt: p, systemAppend: v }),
  },
  {
    id: "S1",
    arm: "A-S1",
    shippable: true,
    note: "voice in user turn",
    deliver: (v, p) => ({ userPrompt: `${v}\n\n${p}` }),
  },
  {
    id: "S2",
    arm: "A-S2",
    shippable: true,
    note: "user turn + reinforcement",
    deliver: (v, p) => ({ userPrompt: `${EMBODIMENT}\n\n${v}\n\n${p}` }),
  },
  {
    id: "S3",
    arm: "A-S3",
    shippable: false,
    note: "system REPLACE (ceiling)",
    deliver: (v, p) => ({ userPrompt: p, systemReplace: v }),
  },
];

type Cell = { subjectIdx: number; promptIdx: number; sample: number; text: string };

interface RungResult {
  id: string;
  note: string;
  shippable: boolean;
  aggLift: ReturnType<typeof stats>;
  selfReport: ReturnType<typeof stats>;
  task: ReturnType<typeof stats>;
  perSubjectLift: { id: string; lift: number; ci95: number }[];
  twoArmRate: number;
  twoArm: { correct: number; total: number };
}

async function main(): Promise<void> {
  const subjects = buildSubjects();
  const prompts = AB_BATTERY.prompts;
  const collector = new ResponseCollector();
  const judgeClient = new ClaudeCliClient({ cachePath: ".judge-cache.json" });
  const judge = realJudge(judgeClient, {});

  console.log(
    `Salience sweep — arms=${collector.model}, judge=haiku, subjects=${subjects.length}, prompts=${prompts.length}, k=${K}, rungs=${RUNGS.map((r) => r.id).join("/")}.`,
  );

  // ── Control (Arm B), collected ONCE, reused as r_B across all rungs (matches Phase 2 cache). ──
  const controlTexts: string[] = [];
  const controlByPrompt = new Map<number, string>(); // promptIdx → a sample-0 control response (for 2-arm)
  const controlTasks: (() => Promise<void>)[] = [];
  for (let p = 0; p < prompts.length; p++) {
    for (let k = 0; k < K; k++) {
      controlTasks.push(async () => {
        const text = await collector.collect({
          userPrompt: prompts[p] as string,
          arm: "B",
          sample: k,
        });
        controlTexts.push(text);
        if (k === 0) controlByPrompt.set(p, text);
      });
    }
  }
  console.log(`Control (Arm B), once — ${controlTasks.length} responses…`);
  await mapLimit(controlTasks, CONCURRENCY, (t) => t());
  const rB = meanVec(await judgeAll(judge, controlTexts));
  console.log(`  r_B ready. Base persona: ${ASPECTS.map((a) => `${a}=${r3(rB[a])}`).join(" ")}`);

  // ── Each rung ────────────────────────────────────────────────────────────────────────────────
  const results: RungResult[] = [];
  for (const rung of RUNGS) {
    const cells: Cell[] = [];
    const tasks: (() => Promise<void>)[] = [];
    for (let si = 0; si < subjects.length; si++) {
      for (let p = 0; p < prompts.length; p++) {
        for (let k = 0; k < K; k++) {
          tasks.push(async () => {
            const d = rung.deliver((subjects[si] as Subject).injection, prompts[p] as string);
            const text = await collector.collect({ ...d, arm: rung.arm, sample: k });
            cells.push({ subjectIdx: si, promptIdx: p, sample: k, text });
          });
        }
      }
    }
    console.log(`\n[${rung.id}] ${rung.note} — collecting ${tasks.length} responses…`);
    await mapLimit(tasks, CONCURRENCY, (t) => t());

    const judged = new Map<Cell, AspectVector>();
    await mapLimit(cells, CONCURRENCY, async (c) => {
      judged.set(c, (await judge.recoverTraits(c.text)) as AspectVector);
    });

    // Per-subject lift (both sides denoised means), aggregate + self-report/task slices.
    const perSubjectLift = subjects.map((subj, si) => {
      const vecs = cells
        .filter((c) => c.subjectIdx === si)
        .map((c) => judged.get(c) as AspectVector);
      const liftSamples = cells
        .filter((c) => c.subjectIdx === si)
        .map((c) => dist(rB, subj.target) - dist(judged.get(c) as AspectVector, subj.target));
      return {
        id: subj.id,
        lift: dist(rB, subj.target) - dist(meanVec(vecs), subj.target),
        ci95: stats(liftSamples).ci95,
      };
    });
    const slice = (pred: (p: number) => boolean) =>
      stats(
        subjects
          .map((subj, si) => {
            const vecs = cells
              .filter((c) => c.subjectIdx === si && pred(c.promptIdx))
              .map((c) => judged.get(c) as AspectVector);
            return vecs.length ? dist(rB, subj.target) - dist(meanVec(vecs), subj.target) : null;
          })
          .filter((x): x is number => x !== null),
      );

    // 2-arm distinguishability: souled (this rung) vs control, blinded slot order.
    let correct = 0;
    let total = 0;
    const twoArmTasks: (() => Promise<void>)[] = [];
    for (let si = 0; si < subjects.length; si++) {
      for (let p = 0; p < prompts.length; p++) {
        twoArmTasks.push(async () => {
          const aTxt = cells.find(
            (c) => c.subjectIdx === si && c.promptIdx === p && c.sample === 0,
          )?.text;
          const bTxt = controlByPrompt.get(p);
          if (!aTxt || !bTxt) return;
          const treatFirst = (si + p) % 2 === 0;
          const pick = await pickPersonality(
            judgeClient,
            prompts[p] as string,
            treatFirst ? aTxt : bTxt,
            treatFirst ? bTxt : aTxt,
          );
          total++;
          if ((pick === "A" && treatFirst) || (pick === "B" && !treatFirst)) correct++;
        });
      }
    }
    await mapLimit(twoArmTasks, CONCURRENCY, (t) => t());

    const res: RungResult = {
      id: rung.id,
      note: rung.note,
      shippable: rung.shippable,
      aggLift: stats(perSubjectLift.map((s) => s.lift)),
      selfReport: slice((p) => p < SELF_REPORT_COUNT),
      task: slice((p) => p >= SELF_REPORT_COUNT),
      perSubjectLift,
      twoArmRate: total ? correct / total : 0,
      twoArm: { correct, total },
    };
    results.push(res);
    console.log(
      `  [${rung.id}] lift=${r3(res.aggLift.mean)} ±${r3(res.aggLift.ci95)}  (self ${r3(res.selfReport.mean)}, task ${r3(res.task.mean)})  2-arm=${r3(res.twoArmRate)}`,
    );
  }

  // ── Verdict (mechanical hint; prose goes in SALIENCE-FINDINGS.md) ─────────────────────────────
  const clears = (s: ReturnType<typeof stats>) => s.mean - s.ci95 > 0; // lower CI bound above zero
  const ceiling = results.find((r) => r.id === "S3");
  const ceilingAlive = ceiling ? clears(ceiling.aggLift) : false;
  const firstShippable = results.find((r) => r.shippable && clears(r.aggLift));
  const verdict = ceilingAlive
    ? `DELIVERY problem — ceiling (S3) lift=${r3(ceiling?.aggLift.mean ?? 0)} clears zero. ${
        firstShippable
          ? `First shippable rung clearing its CI: ${firstShippable.id} (${firstShippable.note}).`
          : "No shippable rung (S0–S2) clears its CI yet — delivery needs more than these knobs."
      }`
    : `FOUNDATIONAL — even the undiluted ceiling (S3) lift=${r3(ceiling?.aggLift.mean ?? 0)} does not clear zero: the voice does not drive behavior as rendered.`;

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        armModel: collector.model,
        judgeModel: "haiku",
        k: K,
        battery: AB_BATTERY,
        subjects: subjects.map((s) => s.id),
        rB,
        results,
        verdict,
        ceilingAlive,
      },
      null,
      2,
    ),
  );

  console.log("\n──────── SALIENCE SWEEP ────────");
  console.log("rung  delivery                     lift ± CI95        self    task    2-arm");
  for (const r of results) {
    console.log(
      `${r.id.padEnd(5)} ${r.note.padEnd(28)} ${(r.aggLift.mean >= 0 ? " " : "") + r3(r.aggLift.mean)} ± ${r3(r.aggLift.ci95)}    ${r3(r.selfReport.mean)}  ${r3(r.task.mean)}  ${r3(r.twoArmRate)}`,
    );
  }
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`\nwrote ${OUT_PATH} — next: SALIENCE-FINDINGS.md`);
}

/** Judge a list of response texts → recovered vectors (parallel). */
async function judgeAll(
  judge: ReturnType<typeof realJudge>,
  texts: string[],
): Promise<AspectVector[]> {
  const out: AspectVector[] = new Array(texts.length);
  await mapLimit(texts, CONCURRENCY, async (t, i) => {
    out[i] = (await judge.recoverTraits(t)) as AspectVector;
  });
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
