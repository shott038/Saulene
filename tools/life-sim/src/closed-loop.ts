/**
 * @saulene/life-sim — closed-loop life driver (Layer D)
 *
 * Per session:
 *   1. render(soul) → voice injection → real synthetic-user ↔ ul conversation
 *   2. real perceive() → evidence-cited ledger
 *   3. ledgerToSignals → practice / fit signals
 *   4. charge → chargeTension → accrueMp → stageFromMp → consolidate  (the real engine loop)
 *   5. advance injected virtual clock
 *   6. snapshot at interval
 *
 * Drift now comes from REAL generated conversations, not scripted ledgers.
 * Clock is INJECTED — never Date.now.
 */

import {
  DEFAULT_KNOBS,
  type GlobalKnobs,
  type Soul,
  accrueMp,
  charge,
  chargeTension,
  consolidate,
  seedFromEntropy,
  stageFromMp,
} from "@saulene/core";
import type { LlmClient } from "@saulene/perception";
import { PerceptionError, ledgerToSignals, perceive } from "@saulene/perception";
import { type Transcript, runConversation } from "./conversation.js";
import type { SyntheticUser } from "./synthetic-user.js";

export interface ClosedLoopOpts {
  /** Birth entropy (same bytes → same ul). */
  seed: Uint8Array;
  /** Drives the user side of every conversation. */
  syntheticUser: SyntheticUser;
  /** LLM for the ul's voice (voice-injected via render(soul)). */
  ulLlm: LlmClient;
  /** LLM for perceive() — reads transcripts into ledgers. */
  perceptionLlm: LlmClient;
  /** Total sessions to run. */
  numSessions: number;
  /** Snapshot every N sessions (always also includes the final session). Default: 3. */
  snapshotEvery?: number;
  /** Conversation turns per session. Default: 3. */
  turns?: number;
  /** Engine knobs. Defaults to DEFAULT_KNOBS. */
  knobs?: GlobalKnobs;
  /** Injected virtual clock: session index → ms timestamp. Never Date.now. */
  clock: (sessionIndex: number) => number;
  /**
   * If true, skip charge/chargeTension/consolidate — v stays at birth.
   * The soul still ages (accrueMp). Use as the control arm for the frozen-soul A/B metric.
   */
  frozen?: boolean;
}

/** One point in the life: the soul's state + the transcript that caused it. */
export interface LifeSnapshot {
  /** Session index this snapshot was taken after (0-based). */
  sessionIndex: number;
  /** Virtual timestamp injected by the clock (ms). */
  virtualTime: number;
  /** The soul's full state after this session's engine loop. */
  soul: Soul;
  /** The transcript generated during this session. */
  transcript: Transcript;
}

/** The full record of a closed-loop life: birth, final, and intermediate snapshots. */
export interface ClosedLoopResult {
  birth: Soul;
  final: Soul;
  snapshots: LifeSnapshot[];
  /** Sessions whose perception failed (malformed LLM output) and were skipped — no drift applied. */
  skipped: number;
}

/**
 * Run a closed-loop synthetic life. Each session:
 *   - renders the live soul → drives a real conversation
 *   - perceives the transcript → feeds real ledger signals into the engine
 *   - advances the soul via the real engine loop
 *
 * Returns birth + final + snapshots at the configured interval.
 */
export async function runClosedLoopLife(opts: ClosedLoopOpts): Promise<ClosedLoopResult> {
  const clock0 = opts.clock(0);
  const birth = seedFromEntropy(opts.seed, clock0);
  let soul = birth;
  const snapshots: LifeSnapshot[] = [];
  let skipped = 0;
  const knobs = opts.knobs ?? DEFAULT_KNOBS;
  const turns = opts.turns ?? 3;
  const snapshotEvery = opts.snapshotEvery ?? 3;

  for (let i = 0; i < opts.numSessions; i++) {
    const virtualTime = opts.clock(i);

    // 1. Run a real conversation with the live soul's rendered voice.
    const transcript = await runConversation(opts.syntheticUser, soul, opts.ulLlm, {
      turns,
      sessionIndex: i,
    });

    // 2. Perceive the transcript → evidence-cited, quote-validated ledger.
    // A cheap model occasionally emits malformed JSON; one bad call must NOT abort the whole
    // (multi-hour) life — skip that session's drift and carry on. The plugin's Stop hook has
    // its own retry; here a retry would just re-hit the deterministic cache, so we skip.
    let judgment: Awaited<ReturnType<typeof perceive>>;
    try {
      judgment = await perceive(transcript.text, opts.perceptionLlm);
    } catch (err) {
      if (err instanceof PerceptionError) {
        skipped++;
        console.error(`[life-sim] session ${i} perception failed — skipped: ${err.message}`);
        continue;
      }
      throw err;
    }

    // 3. Convert ledger observations → per-aspect engine signals.
    const { practice, fit } = ledgerToSignals(judgment.observations);
    const significance = judgment.session_significance;

    // 4. Engine loop — mirrors simulator/lifetime.ts's per-session step.
    if (!opts.frozen) {
      soul = charge(soul, practice, knobs);
      soul = chargeTension(soul, { practice, fit }, knobs);
      soul = { ...soul, mp: accrueMp(soul, significance) };
      const stage = stageFromMp(soul.mp, soul);
      soul = consolidate(soul, knobs, stage);
    } else {
      // Frozen control arm: age only; v stays at birth values.
      soul = { ...soul, mp: accrueMp(soul, significance) };
    }

    // 5. Snapshot at interval or on the final session.
    const isLast = i === opts.numSessions - 1;
    if (i % snapshotEvery === 0 || isLast) {
      snapshots.push({
        sessionIndex: i,
        virtualTime,
        soul: { ...soul },
        transcript,
      });
    }
  }

  return { birth, final: { ...soul }, snapshots, skipped };
}
