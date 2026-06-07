/**
 * @saulene/harness — max-contrast renderer diagnostic (Phase 3.5). Dev-only, subscription-only.
 *
 * Run:  pnpm --filter @saulene/harness run diagnostic
 *
 * Does the renderer drive ANY distinguishable behavioral contrast at MAXIMUM trait separation? Two
 * opposite souls (INTJ-cold vs ENFP-warm), S1 delivery (voice in the user/conversation channel),
 * 3 prompts, k=1, Haiku for both arms and the judge. A blind 2AFC judge maps each pair of responses
 * to the two behavioral descriptions.
 *
 *   accuracy ≥ 0.70  → the renderer WORKS; the earlier near-neighbor souls were just too similar.
 *   accuracy ≈ 0.50  → the renderer is BROKEN (max contrast still indistinguishable).
 *
 * Reuses the `ResponseCollector` cache (`.ab-cache.json`); subscription-only (no API key).
 */

import { writeFileSync } from "node:fs";
import { render as realRender } from "@saulene/renderer";
import { ResponseCollector } from "./ab-collect.js";
import { r3 } from "./ab-core.js";
import { DESC_A, DESC_B, SOUL_A, SOUL_B } from "./diagnostic-souls.js";
import { forcedChoice } from "./forced-choice.js";
import { ClaudeCliClient } from "./llm.js";

const OUT_PATH = ".diagnostic-run.json";

/** 3 prompts spanning emotional-conflict, blunt-critique, and free-time — where the contrast should bite. */
const PROMPTS = [
  "My friend is upset about something I said. How do I handle it?",
  "Give me your brutally honest take on my idea — don't hold back.",
  "How do you like to spend a free afternoon?",
];

async function main(): Promise<void> {
  const collector = new ResponseCollector({ model: "haiku" }); // arms = haiku (per the diagnostic spec)
  const judge = new ClaudeCliClient({ cachePath: ".judge-cache.json", model: "haiku" });
  const voiceA = realRender(SOUL_A).text;
  const voiceB = realRender(SOUL_B).text;

  console.log(
    `Max-contrast diagnostic — arms=haiku, judge=haiku, S1 delivery, ${PROMPTS.length} prompts, k=1.`,
  );

  const rows: { prompt: string; pick: string; swapped: boolean; correct: boolean }[] = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i] as string;
    // S1 delivery: voice prepended into the user turn.
    const respA = await collector.collect({
      userPrompt: `${voiceA}\n\n${prompt}`,
      arm: "DIAG-A",
      sample: 0,
    });
    const respB = await collector.collect({
      userPrompt: `${voiceB}\n\n${prompt}`,
      arm: "DIAG-B",
      sample: 0,
    });
    const swap = i % 2 === 1; // randomize slot order across prompts (deterministic ⇒ cache-stable)
    const fc = await forcedChoice(judge, prompt, respA, respB, DESC_A, DESC_B, swap);
    rows.push({ prompt, pick: fc.pick, swapped: fc.swapped, correct: fc.correct });
    console.log(
      `  P${i + 1} ${fc.correct ? "✓" : "✗"} (judge said ${fc.pick}, swap=${fc.swapped}) — ${prompt}`,
    );
  }

  const correct = rows.filter((r) => r.correct).length;
  const accuracy = correct / rows.length;
  const verdict =
    accuracy >= 0.7
      ? "RENDERER WORKS — max-contrast souls are distinguishable; the earlier near-neighbor souls were too similar."
      : accuracy <= 0.5
        ? "RENDERER BROKEN — even maximum trait separation is indistinguishable (≈ chance)."
        : "INCONCLUSIVE — above chance but below the 0.70 bar (only 3 prompts; widen the battery / add k).";

  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model: "haiku",
        delivery: "S1",
        prompts: PROMPTS,
        rows,
        correct,
        accuracy,
        verdict,
        responseCalls: collector.calls,
        responseHits: collector.hits,
      },
      null,
      2,
    ),
  );

  console.log(`\nPer-prompt accuracy: ${rows.map((r) => (r.correct ? 1 : 0)).join(", ")}`);
  console.log(`Overall accuracy: ${correct}/${rows.length} = ${r3(accuracy)}  (chance 0.5)`);
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
