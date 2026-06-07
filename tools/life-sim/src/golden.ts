/**
 * @saulene/life-sim — golden closed-loop validation script (Layer D)
 *
 * Gated behind SAULENE_LIVE=1 so it never runs in CI.
 * Run: SAULENE_LIVE=1 pnpm --filter @saulene/life-sim golden
 *
 * Runs a handful of golden lives via real `claude -p` (subscription, no API key),
 * executes all four validation metrics, and writes FINDINGS.md with the verdicts.
 *
 * What a "golden life" is:
 *   15 sessions × real synthetic-user ↔ ul conversations + real perceive()
 *   Snapshots every 3 sessions (5 snapshots at sessions 0, 3, 6, 9, 12, 14).
 *
 * Virtual time: each session = 1 week. Session 0 = EPOCH = 2023-11-14.
 * Clock is injected — no Date.now anywhere in the pipeline.
 */

if (!process.env.SAULENE_LIVE) {
  console.error("Set SAULENE_LIVE=1 to run the golden validation script.");
  process.exit(1);
}

import { writeFileSync } from "node:fs";
import { entropyFromInt } from "@saulene/simulator";
import { block, lifetime, script } from "@saulene/simulator";
import { runClosedLoopLife } from "./closed-loop.js";
import { ClaudeCliClient } from "./llm.js";
import { SyntheticUser } from "./synthetic-user.js";
import { realValidationJudge } from "./validation/judge.js";
import {
  FROZEN_DIVERGENCE_THRESHOLD,
  SURROGATE_ERROR_THRESHOLD,
  TWO_LIVES_V_THRESHOLD,
  crossTimeIdentity,
  frozenSoulControlAB,
  surrogateVsTruth,
  twoLivesOneSeed,
} from "./validation/metrics.js";

// ── Config ─────────────────────────────────────────────────────────────────────

const MODEL = "haiku";
const CACHE_PATH = ".life-sim-golden-cache.json";
const FINDINGS_PATH = "FINDINGS.md";
const NUM_SESSIONS = 15;
const SNAPSHOT_EVERY = 3;
const TURNS = 3;

// Virtual clock: session i = EPOCH + i weeks (deterministic, no Date.now)
const EPOCH_MS = 1_700_000_000_000; // ~2023-11-14
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const clock = (i: number) => EPOCH_MS + i * WEEK_MS;

// Seeds — three distinct birth entropies
const SEEDS = [entropyFromInt(0x10), entropyFromInt(0x20), entropyFromInt(0x30)];

// ── LLM clients ────────────────────────────────────────────────────────────────

const sharedCache = CACHE_PATH;
function makeClient() {
  return new ClaudeCliClient({ model: MODEL, cachePath: sharedCache });
}

const judgeClient = makeClient();
const judge = realValidationJudge(judgeClient);

// ── Helpers ────────────────────────────────────────────────────────────────────

function passEmoji(pass: boolean): string {
  return pass ? "✓ PASS" : "✗ FAIL";
}

function fmt(n: number): string {
  return n.toFixed(4);
}

// ── Golden life runs ──────────────────────────────────────────────────────────

console.log(
  `Golden life validation — model=${MODEL}, sessions=${NUM_SESSIONS}, seeds=${SEEDS.length}`,
);

type Verdict = {
  seed: number;
  crossTime: Awaited<ReturnType<typeof crossTimeIdentity>>;
  frozenSoul: ReturnType<typeof frozenSoulControlAB>;
  twoLives: Awaited<ReturnType<typeof twoLivesOneSeed>>;
  surrogate: ReturnType<typeof surrogateVsTruth>;
};

const verdicts: Verdict[] = [];
let totalCalls = 0;
let totalHits = 0;

for (let si = 0; si < SEEDS.length; si++) {
  const seed = SEEDS[si];
  if (!seed) continue;
  console.log(`\n── Seed ${si + 1}/${SEEDS.length} ──`);

  // Aligned user: creative, exploratory work (expects positive drift)
  const alignedUser = new SyntheticUser(
    { persona: "creative-warm", workType: "creative-exploration" },
    makeClient(),
  );

  // Grind user: technical, administrative, misaligned (expects negative-fit tension)
  const grindUser = new SyntheticUser(
    { persona: "technical-curt", workType: "admin" },
    makeClient(),
  );

  const ulLlm = makeClient();
  const perceptionLlm = makeClient();

  // ── Run 1: Aligned drifting life ──────────────────────────────────────────
  console.log("  [1/4] Running aligned drifting life...");
  const alignedDrifting = await runClosedLoopLife({
    seed,
    syntheticUser: alignedUser,
    ulLlm,
    perceptionLlm,
    numSessions: NUM_SESSIONS,
    snapshotEvery: SNAPSHOT_EVERY,
    turns: TURNS,
    clock,
  });
  console.log(`        done — ${alignedDrifting.snapshots.length} snapshots`);

  // ── Run 2: Aligned frozen life (control arm) ──────────────────────────────
  console.log("  [2/4] Running aligned frozen life (control arm)...");
  const alignedFrozen = await runClosedLoopLife({
    seed,
    syntheticUser: new SyntheticUser(
      { persona: "creative-warm", workType: "creative-exploration" },
      makeClient(),
    ),
    ulLlm: makeClient(),
    perceptionLlm: makeClient(),
    numSessions: NUM_SESSIONS,
    snapshotEvery: SNAPSHOT_EVERY,
    turns: TURNS,
    clock,
    frozen: true,
  });
  console.log(`        done — ${alignedFrozen.snapshots.length} snapshots`);

  // ── Run 3: Grind drifting life ────────────────────────────────────────────
  console.log("  [3/4] Running grind drifting life...");
  const grindDrifting = await runClosedLoopLife({
    seed, // same seed — same ul birth
    syntheticUser: grindUser,
    ulLlm: makeClient(),
    perceptionLlm: makeClient(),
    numSessions: NUM_SESSIONS,
    snapshotEvery: SNAPSHOT_EVERY,
    turns: TURNS,
    clock,
  });
  console.log(`        done — ${grindDrifting.snapshots.length} snapshots`);

  // ── Metric 1: Cross-time identity (aligned drifting life) ─────────────────
  console.log("  [4/4] Running validation metrics...");
  const earlySnap = alignedDrifting.snapshots[0];
  const lateSnap = alignedDrifting.snapshots.at(-1);
  if (!earlySnap || !lateSnap) throw new Error("No snapshots in aligned drifting life");
  const crossTime = await crossTimeIdentity(earlySnap, lateSnap, judge);
  console.log(
    `        cross-time: ${passEmoji(crossTime.pass)} (sameBeing=${crossTime.sameBeing}, orderable=${crossTime.orderable})`,
  );

  // ── Metric 2: Frozen-soul control A/B ─────────────────────────────────────
  const frozenSoul = frozenSoulControlAB(
    alignedDrifting,
    alignedFrozen,
    FROZEN_DIVERGENCE_THRESHOLD,
  );
  console.log(
    `        frozen-soul: ${passEmoji(frozenSoul.diverges)} (vDist=${fmt(frozenSoul.vDistance)})`,
  );

  // ── Metric 3: Two-lives-one-seed ─────────────────────────────────────────
  const twoLives = await twoLivesOneSeed(
    alignedDrifting,
    grindDrifting,
    judge,
    TWO_LIVES_V_THRESHOLD,
  );
  console.log(
    `        two-lives: ${passEmoji(twoLives.pass)} (distinguishable=${twoLives.distinguishable}, vDist=${fmt(twoLives.vDistance)})`,
  );

  // ── Metric 4: Surrogate-vs-truth ─────────────────────────────────────────
  // TODO(merge-W2): swap in CorpusLedgerSource + empirical population() when life-sim-pop merges.
  // For now: pure-engine lifetime() with scripted sessions approximating an aligned life.
  const surrogateTraj = lifetime(
    seed,
    script(
      block({
        aspects: ["openness", "intellect", "industriousness"],
        practice: 0.6,
        fit: 0.5,
        significance: 0.4,
        count: NUM_SESSIONS,
      }),
    ),
  );
  const surrogate = surrogateVsTruth(alignedDrifting, surrogateTraj, SURROGATE_ERROR_THRESHOLD);
  console.log(
    `        surrogate: ${passEmoji(surrogate.matches)} (meanVErr=${fmt(surrogate.meanVError)})`,
  );

  verdicts.push({ seed: si, crossTime, frozenSoul, twoLives, surrogate });

  // Tally stats (approximate — clients share the cache but have separate counters)
  for (const c of [ulLlm, perceptionLlm, judgeClient]) {
    totalCalls += (c as ClaudeCliClient).calls;
    totalHits += (c as ClaudeCliClient).hits;
  }
}

// ── Write FINDINGS.md ──────────────────────────────────────────────────────────

const generatedAt = new Date(Date.now()).toISOString();

function verdictSection(v: Verdict, idx: number): string {
  const sn = `Seed ${idx + 1}`;
  const lines: string[] = [];

  lines.push(`### ${sn}\n`);

  lines.push(`#### 1. Cross-time identity — ${passEmoji(v.crossTime.pass)}`);
  lines.push(`- Same being: **${v.crossTime.sameBeing}**`);
  lines.push(`- Orderable in time: **${v.crossTime.orderable}**`);
  lines.push(`- Confidence: ${v.crossTime.confidence}`);
  lines.push(`- Reasoning: *"${v.crossTime.reasoning}"*\n`);

  lines.push(`#### 2. Frozen-soul control A/B — ${passEmoji(v.frozenSoul.diverges)}`);
  lines.push(
    `- v-distance (drifting vs frozen): **${fmt(v.frozenSoul.vDistance)}** (threshold: ${fmt(FROZEN_DIVERGENCE_THRESHOLD)})`,
  );
  lines.push(`- Per-snapshot distances: [${v.frozenSoul.snapshotDistances.map(fmt).join(", ")}]\n`);

  lines.push(`#### 3. Two-lives-one-seed felt divergence — ${passEmoji(v.twoLives.pass)}`);
  lines.push(
    `- Distinguishable: **${v.twoLives.distinguishable}** (confidence: ${v.twoLives.confidence})`,
  );
  lines.push(
    `- Engine v-distance: **${fmt(v.twoLives.vDistance)}** (threshold: ${fmt(TWO_LIVES_V_THRESHOLD)})`,
  );
  lines.push(`- Judge explanation: *"${v.twoLives.explanation}"*\n`);

  lines.push(`#### 4. Surrogate-vs-truth — ${passEmoji(v.surrogate.matches)}`);
  lines.push(
    `- Mean v-error (closed-loop vs pure-engine): **${fmt(v.surrogate.meanVError)}** (threshold: ${fmt(SURROGATE_ERROR_THRESHOLD)})`,
  );
  lines.push(`- Per-snapshot errors: [${v.surrogate.snapshotErrors.map(fmt).join(", ")}]`);
  lines.push(
    "- Note: surrogate is pure-engine lifetime() with scripted sessions (generous threshold). TODO(merge-W2): swap for empirical CorpusLedgerSource.\n",
  );

  return lines.join("\n");
}

const allPass = verdicts.every(
  (v) => v.crossTime.pass && v.frozenSoul.diverges && v.twoLives.pass && v.surrogate.matches,
);

const findings = [
  "# Life-Sim Validation — FINDINGS (Layer D)",
  "",
  `Generated: ${generatedAt}  `,
  `Model: ${MODEL}  `,
  `Sessions per life: ${NUM_SESSIONS} | Snapshots every: ${SNAPSHOT_EVERY} | Virtual time: ~${NUM_SESSIONS} weeks  `,
  `Seeds: ${SEEDS.length} | Total model calls: ~${totalCalls} | Cache hits: ~${totalHits}`,
  "",
  `## Overall verdict: ${allPass ? "✓ ALL PASS" : "✗ SOME FAILURES"}`,
  "",
  `The four metrics answer: "does a synthetically generated life feel like a person changing over time?"`,
  "",
  "| Metric | Seed 1 | Seed 2 | Seed 3 |",
  "|--------|--------|--------|--------|",
  `| Cross-time identity | ${passEmoji(verdicts[0]?.crossTime.pass ?? false)} | ${passEmoji(verdicts[1]?.crossTime.pass ?? false)} | ${passEmoji(verdicts[2]?.crossTime.pass ?? false)} |`,
  `| Frozen-soul control | ${passEmoji(verdicts[0]?.frozenSoul.diverges ?? false)} | ${passEmoji(verdicts[1]?.frozenSoul.diverges ?? false)} | ${passEmoji(verdicts[2]?.frozenSoul.diverges ?? false)} |`,
  `| Two-lives-one-seed | ${passEmoji(verdicts[0]?.twoLives.pass ?? false)} | ${passEmoji(verdicts[1]?.twoLives.pass ?? false)} | ${passEmoji(verdicts[2]?.twoLives.pass ?? false)} |`,
  `| Surrogate-vs-truth | ${passEmoji(verdicts[0]?.surrogate.matches ?? false)} | ${passEmoji(verdicts[1]?.surrogate.matches ?? false)} | ${passEmoji(verdicts[2]?.surrogate.matches ?? false)} |`,
  "",
  "## Detailed verdicts",
  "",
  ...verdicts.map((v, i) => verdictSection(v, i)),
  "## What the metrics measure",
  "",
  "1. **Cross-time identity**: A blind judge reads two transcripts from the same life (early vs late).",
  "   The judge must identify them as the same entity AND correctly order them by time.",
  "   This is the primary test — it captures both *continuity* (same soul) and *perceptible change*.",
  "",
  "2. **Frozen-soul control A/B**: The same life script is run against (a) a drifting soul and",
  "   (b) a frozen soul (v locked at birth). The drifting arm must diverge from the frozen arm,",
  "   proving that real generated conversations drive real soul evolution (not noise).",
  "",
  "3. **Two-lives-one-seed**: Same seed (same birth), aligned-user life vs grind-user life.",
  "   A blind judge must read the two final-session transcripts as different people.",
  `   This is the CLI-in-the-loop version of the SPEC's headline acceptance test.`,
  "",
  "4. **Surrogate-vs-truth**: The pure-engine `lifetime()` prediction (scripted sessions, no LLM)",
  "   is compared to the expensive closed-loop truth. A generous threshold (0.30) checks that the",
  "   surrogate is in the right ballpark. TODO(merge-W2): upgrade to CorpusLedgerSource.",
].join("\n");

writeFileSync(FINDINGS_PATH, findings);

console.log(`\n✓ Done. Wrote ${FINDINGS_PATH}`);
console.log(`Overall: ${allPass ? "ALL PASS ✓" : "SOME FAILURES ✗"}`);
