/**
 * @saulene/life-sim — corpus builder (live script)
 *
 * Gated behind SAULENE_LIVE=1 so it never runs in CI.
 * Run: SAULENE_LIVE=1 pnpm --filter @saulene/life-sim corpus
 *
 * Builds a small fingerprint corpus using real `claude -p` calls.
 * Output: .life-sim-corpus.jsonl (append mode — safe to re-run; cache skips paid calls).
 */

if (!process.env.SAULENE_LIVE) {
  console.error("Set SAULENE_LIVE=1 to run the live corpus builder.");
  process.exit(1);
}

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { seedFromEntropy } from "@saulene/core";
import { PERSONAS, WORK_TYPES, allBuckets, classifyState } from "./buckets.js";
import { buildFingerprint } from "./fingerprint.js";
import { ClaudeCliClient } from "./llm.js";

const CORPUS_PATH = ".life-sim-corpus.jsonl";
const MODEL = "haiku";

// ── Build a small representative set of souls ─────────────────────────────────
// Three seeds → three distinct souls covering high/neutral/depleted state space.
const ENTROPY_SEEDS = [0x42, 0xab, 0x7f];
const FIXED_NOW = 1_700_000_000_000; // deterministic timestamp

const souls = ENTROPY_SEEDS.map((seed) => {
  const entropy = new Uint8Array(32);
  for (let i = 0; i < 4; i++) entropy[i] = (seed >> (i * 8)) & 0xff;
  return seedFromEntropy(entropy, FIXED_NOW);
});

console.log("Souls:", souls.map((s, i) => `#${i} stateBucket=${classifyState(s)}`).join(", "));

// ── Build a small subset of buckets for the initial corpus ───────────────────
// Full grid is 240 buckets × 3 souls = 720 sessions. For a starter corpus, run
// all persona × workType combinations but only the neutral stateBucket.
const startBuckets = allBuckets().filter((b) => b.stateBucket === "neutral");
console.log(
  `Running ${startBuckets.length} buckets × ${souls.length} souls = ${startBuckets.length * souls.length} sessions`,
);

// ── LLM clients (real claude -p, cached) ─────────────────────────────────────
const userLlm = new ClaudeCliClient({ model: MODEL, cachePath: ".life-sim-cache.json" });
const ulLlm = new ClaudeCliClient({ model: MODEL, cachePath: ".life-sim-cache.json" });
const perceptionLlm = new ClaudeCliClient({ model: MODEL, cachePath: ".life-sim-cache.json" });

// ── Run ───────────────────────────────────────────────────────────────────────
const records = await buildFingerprint({
  buckets: startBuckets,
  souls,
  userLlm,
  ulLlm,
  perceptionLlm,
  model: MODEL,
  turns: 3,
  onRecord: (record, { done, total }) => {
    const line = `${JSON.stringify(record)}\n`;
    appendFileSync(CORPUS_PATH, line);
    const pct = Math.round((done / total) * 100);
    console.log(
      `[${pct}%] ${done}/${total} — ${record.bucket.persona}/${record.bucket.workType} → ${record.ledger.observations.length} obs`,
    );
  },
});

console.log(`\nDone. ${records.length} records written to ${CORPUS_PATH}`);
console.log(`Cache hits: user=${userLlm.hits} ul=${ulLlm.hits} perception=${perceptionLlm.hits}`);
console.log(
  `Live calls: user=${userLlm.calls} ul=${ulLlm.calls} perception=${perceptionLlm.calls}`,
);
