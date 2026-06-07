/**
 * @saulene/life-sim — fingerprint builder
 *
 * Runs conversations across a bucketed space (persona × workType × stateBucket × stage),
 * calls real perceive() on each transcript, records the empirical ledger distribution
 * to a JSONL corpus. Fully DI — all LLM calls are injected, so CI uses fakes.
 *
 * The corpus is the "pay once for truth" artifact; W2 samples from it.
 */

import type { Soul } from "@saulene/core";
import { stageFromMp } from "@saulene/core";
import type { LlmClient } from "@saulene/perception";
import { perceive } from "@saulene/perception";
import { soulHash } from "@saulene/renderer";
import type { Bucket } from "./buckets.js";
import { PERSONA_DESCRIPTIONS } from "./buckets.js";
import { runConversation } from "./conversation.js";
import type { CorpusRecord } from "./ledger-source.js";
import { serializeRecord } from "./ledger-source.js";
import { SyntheticUser } from "./synthetic-user.js";

export interface FingerprintOpts {
  /** Injected LlmClient for the synthetic user's turns. */
  userLlm: LlmClient;
  /** Injected LlmClient for the ul's turns (voice-injected). */
  ulLlm: LlmClient;
  /** Injected LlmClient for perception (reads the transcript). */
  perceptionLlm: LlmClient;
  /** Number of conversation turns per session (2–4). */
  turns?: number;
  /** Model tag recorded in the corpus meta. */
  model?: string;
  /** Called with each completed corpus record (for streaming writes). */
  onRecord?: (record: CorpusRecord, progress: { done: number; total: number }) => void;
}

/** Run one fingerprint session for a given bucket + soul, returning the corpus record. */
export async function runFingerprintSession(
  bucket: Bucket,
  soul: Soul,
  opts: FingerprintOpts,
): Promise<CorpusRecord> {
  const user = new SyntheticUser(
    { persona: bucket.persona, workType: bucket.workType },
    opts.userLlm,
  );

  const transcript = await runConversation(user, soul, opts.ulLlm, {
    turns: opts.turns ?? 3,
    sessionIndex: 0,
  });

  const judgment = await perceive(transcript.text, opts.perceptionLlm);

  return {
    bucket,
    ledger: {
      observations: judgment.observations,
      sessionSignificance: judgment.session_significance,
    },
    meta: {
      soulHash: transcript.soulHash,
      model: opts.model ?? "unknown",
    },
  };
}

export interface FingerprintRunOpts extends FingerprintOpts {
  /** Pre-built souls to pair with each bucket. Each soul is classified into a stateBucket. */
  souls: Soul[];
  /** The specific buckets to run. Defaults to all buckets for the provided souls. */
  buckets: Bucket[];
}

/**
 * Run the full fingerprint sweep and return all corpus records.
 * Each (bucket, soul) pair produces one record. souls are matched to stateBuckets;
 * the caller provides pre-classified souls that cover the state space.
 */
export async function buildFingerprint(opts: FingerprintRunOpts): Promise<CorpusRecord[]> {
  const records: CorpusRecord[] = [];
  const total = opts.buckets.length * opts.souls.length;
  let done = 0;

  for (const bucket of opts.buckets) {
    for (const soul of opts.souls) {
      const record = await runFingerprintSession(bucket, soul, opts);
      records.push(record);
      done++;
      opts.onRecord?.(record, { done, total });
    }
  }

  return records;
}

/** Serialize a set of corpus records to a JSONL string. */
export function corpusToJsonl(records: CorpusRecord[]): string {
  return `${records.map(serializeRecord).join("\n")}\n`;
}
