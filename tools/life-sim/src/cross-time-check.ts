/**
 * @saulene/life-sim — cross-time age-expression confirmation (live)
 *
 * Targeted check that the new renderer age layer closes the `orderable=false` gap. Instead of a
 * 15-session golden life (which barely ages — stays inside childhood), this ISOLATES the age
 * effect: one soul, identical personality `v`, rendered at a YOUNG mp vs an OLD mp. It drives a
 * real synthetic-user ↔ ul conversation at each age (the age-manner voice is in render(soul).text),
 * then asks the blind judge to (a) confirm it's the same being and (b) order the two in time.
 *
 * Holding `v` fixed isolates the age expression: any `orderable=true` is the age layer alone, not
 * trait drift. sameBeing should stay true (identical personality numbers).
 *
 * Gated behind SAULENE_LIVE=1. All haiku via the subscription `claude -p`. ~13 calls/seed.
 * Run: SAULENE_LIVE=1 SAULENE_CLAUDE_BIN=… pnpm --filter @saulene/life-sim cross-time
 */

import { type Soul, presentedAge, seedFromEntropy } from "@saulene/core";
import { entropyFromInt } from "@saulene/simulator";
import { ClaudeCliClient } from "./llm.js";
import { type Transcript, runConversation } from "./conversation.js";
import { SyntheticUser } from "./synthetic-user.js";
import { crossTimeIdentity } from "./validation/index.js";
import { realValidationJudge } from "./validation/index.js";
import type { LifeSnapshot } from "./closed-loop.js";

if (!process.env.SAULENE_LIVE) {
  console.error("Set SAULENE_LIVE=1 to run the live cross-time check.");
  process.exit(0);
}

const MODEL = "haiku";
const YOUNG_MP = 10; // childhood → presents ~13–15
const OLD_MP = 600; // old_adulthood → presents ~60+
const SEEDS = [0x10, 0x20, 0x30];
const EPOCH = 1_700_000_000_000;

function snap(soul: Soul, transcript: Transcript, sessionIndex: number): LifeSnapshot {
  return { sessionIndex, virtualTime: EPOCH + sessionIndex, soul, transcript };
}

async function main(): Promise<void> {
  const ulLlm = new ClaudeCliClient({ model: MODEL, cachePath: ".cross-time-cache.json" });
  const userLlm = new ClaudeCliClient({ model: MODEL, cachePath: ".cross-time-cache.json" });
  const judge = realValidationJudge(
    new ClaudeCliClient({ model: MODEL, cachePath: ".cross-time-cache.json" }),
  );
  const user = new SyntheticUser({ persona: "analytical-reserved", workType: "deep-focus" }, userLlm);

  let orderableCount = 0;
  let sameBeingCount = 0;

  console.log(`Cross-time age-expression check — model=${MODEL}, ${SEEDS.length} seeds`);
  console.log("(same personality v, young mp vs old mp → judge orders them)\n");

  for (const s of SEEDS) {
    const base = seedFromEntropy(entropyFromInt(s), EPOCH);
    const young = { ...base, mp: YOUNG_MP };
    const old = { ...base, mp: OLD_MP };

    const youngConv = await runConversation(user, young, ulLlm, { turns: 3, sessionIndex: 0 });
    const oldConv = await runConversation(user, old, ulLlm, { turns: 3, sessionIndex: 1 });

    // early = young (A), late = old (B): orderable=true ⇔ judge picks A as earlier.
    const r = await crossTimeIdentity(snap(young, youngConv, 0), snap(old, oldConv, 1), judge);

    if (r.orderable) orderableCount++;
    if (r.sameBeing) sameBeingCount++;
    console.log(
      `seed ${s.toString(16)}: age ${presentedAge(young).toFixed(0)}→${presentedAge(old).toFixed(0)} | ` +
        `sameBeing=${r.sameBeing} orderable=${r.orderable} pass=${r.pass} (${r.confidence})`,
    );
    console.log(`   ↳ ${r.reasoning}\n`);
  }

  const n = SEEDS.length;
  console.log("── SUMMARY ──");
  console.log(`sameBeing: ${sameBeingCount}/${n}   orderable: ${orderableCount}/${n}`);
  console.log(
    orderableCount > n / 2
      ? "✓ GAP CLOSED — age expression makes the same soul time-orderable."
      : "✗ still not orderable — age expression needs more contrast.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
