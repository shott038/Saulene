/**
 * @saulene/plugin — Stop hook handler (the drift pipeline)
 *
 * Fires at the end of every Claude Code session. Runs the full perceive → consolidate →
 * persist pipeline:
 *
 *   1. `perceive(transcript, llm)` → bounded, evidence-cited `SessionJudgment`
 *   2. Convert observations to per-aspect practice/fit signals (normalized 0–1 scale)
 *   3. `charge(soul, practiceSignal)` — fast-loop accumulator update
 *   4. `chargeTension(soul, {practice, fit})` — slow grievance loop
 *   5. `accrueMp` + `stageFromMp` — age the ul, recompute the life stage
 *   6. `consolidate(soul, knobs, stage)` — commit to the 10 floats; breaking points fire here
 *   7. `saveSoul` + `appendLedger` per observation + `appendDiary` — persist everything
 *
 * Perception errors are caught and logged (not thrown) — a bad LLM response must not corrupt
 * or discard the soul's existing state. The soul is only ever written after a CLEAN pipeline.
 *
 * SPEC: "session-end hook hands the transcript to the drift engine → observe what the ul
 * actually lived through directly (don't depend on the agent self-reporting)."
 */

import { randomUUID } from "node:crypto";
import {
  ASPECTS,
  DEFAULT_KNOBS,
  accrueMp,
  charge,
  chargeTension,
  consolidate,
  stageFromMp,
} from "@saulene/core";
import { PerceptionError, ledgerToSignals, perceiveDetailed } from "@saulene/perception";
import type { LlmClient } from "@saulene/perception";
import { appendDiary, appendLedger, defaultRoot, loadSoul, saveSoul } from "@saulene/storage";
import { type ReporterOpts, reportEvent } from "../reporter/reporter.js";

export interface StopOpts {
  /** The full session transcript — handed to perception for judgment. */
  transcript: string;
  /**
   * The LLM client for the perception call. Injected here (the IO edge) — never hardcoded
   * inside perception, so tests can pass a `FakeLlmClient`.
   */
  llm: LlmClient;
  /**
   * Storage root; defaults to `~/.saulene`. Tests pass a temp dir so the real soul is never
   * touched.
   */
  storageRoot?: string;
  /** Unix timestamp (ms) — injected by the caller, never read from Date.now() inside. */
  now?: number;
  /** Session ID for history records; auto-generated (uuid v4) when omitted. */
  sessionId?: string;
  /**
   * Override reporter transport/URL (for tests). In production the reporter reads
   * SAULENE_REGISTRY_URL from the env. Omitting this does not affect hook behavior.
   */
  reporterOpts?: Pick<ReporterOpts, "registryUrl" | "fetch">;
}

/** How many times to attempt perception before skipping the session (1 retry on malformed output). */
const PERCEPTION_ATTEMPTS = 2;

/**
 * Stop hook handler — the perceive → consolidate → persist drift pipeline.
 *
 * Does NOT throw on `PerceptionError` — perception is retried once, then a still-failing pass is
 * logged and skipped; the soul is untouched. Other errors (storage, engine) propagate normally.
 */
export async function stop(opts: StopOpts): Promise<void> {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();
  const sessionId = opts.sessionId ?? randomUUID();

  // ── 1. Soul presence ─────────────────────────────────────────────────────────
  let soul = loadSoul(root);
  if (!soul) return; // not born yet — nothing to consolidate
  const priorMp = soul.mp; // snapshot before aging (for stage-change detection)

  // ── 2. Perceive ───────────────────────────────────────────────────────────────
  // LLM reads the transcript and emits a bounded, evidence-cited judgment. A cheap model can
  // occasionally emit malformed JSON (truncation, unescaped chars) — retry once before giving
  // up, since the plugin's CLI client is uncached so a fresh call can recover. On final failure
  // we log and bail — the soul state is untouched, never corrupted by a bad response.
  let result: Awaited<ReturnType<typeof perceiveDetailed>> | undefined;
  let lastErr: PerceptionError | undefined;
  for (let attempt = 1; attempt <= PERCEPTION_ATTEMPTS; attempt++) {
    try {
      result = await perceiveDetailed(opts.transcript, opts.llm);
      break;
    } catch (err) {
      if (err instanceof PerceptionError) {
        lastErr = err;
        console.error(
          `[saulene/stop] perception attempt ${attempt}/${PERCEPTION_ATTEMPTS} failed: ${err.message}`,
        );
        continue;
      }
      // Transport / CLI / auth failure — not retriable; skip drift, soul untouched.
      const msg = err instanceof Error ? err.message : String(err);
      if (/not logged in|please run \/login/i.test(msg)) {
        console.error(
          "Saulene: personality drift is paused — run `claude` in a terminal and log in (or set SAULENE_PERCEPTION_API_KEY) to enable it.",
        );
      } else {
        console.error(
          `[saulene/stop] perception transport error — session not consolidated: ${msg.slice(0, 120)}`,
        );
      }
      return;
    }
  }
  if (!result) {
    console.error(
      "[saulene/stop] perception failed after retries — session not consolidated:",
      lastErr?.message,
    );
    return;
  }
  const { judgment, rejected } = result;

  if (rejected.length > 0) {
    // Stripped rows: hallucinated quotes or user-profiling attempts — logged for visibility.
    console.warn(
      `[saulene/stop] ${rejected.length} observation(s) stripped by the validation gate`,
    );
  }

  // ── 3. Signal conversion ──────────────────────────────────────────────────────
  // Delegate to the shared ledgerToSignals (one source of truth with tools/life-sim).
  const { practice: practiceSignal, fit: fitSignal } = ledgerToSignals(judgment.observations);

  // ── 4. Fast loops ─────────────────────────────────────────────────────────────
  // charge: practice IS the drive signal (how much the aspect was exercised this session).
  // chargeTension: only "did a lot AND hated it" (negative fit under real practice) charges.
  soul = charge(soul, practiceSignal, DEFAULT_KNOBS);
  soul = chargeTension(soul, { practice: practiceSignal, fit: fitSignal }, DEFAULT_KNOBS);

  // ── 5. Aging ──────────────────────────────────────────────────────────────────
  // Accrue MP from session significance (rate-capped in core so it can't be farmed).
  // Update lastUsedAt to reset the 90-day neglect-death clock.
  const newMp = accrueMp(soul, judgment.session_significance);
  soul = { ...soul, mp: newMp, lastUsedAt: now };

  // ── 6. Consolidation ──────────────────────────────────────────────────────────
  // Stage is recomputed at the NEW age (per-ul jittered bands). Breaking points fire inside
  // core after the normal update — the ONLY thing that moves set points.
  const priorStage = stageFromMp(priorMp, soul); // stage before this session's aging
  const stage = stageFromMp(soul.mp, soul); // stage at the new age (post-accrual)
  const preRefractory = { ...soul.refractory }; // snapshot before consolidate to detect ruptures
  soul = consolidate(soul, DEFAULT_KNOBS, stage);

  // ── 7. Persist ────────────────────────────────────────────────────────────────
  // saveSoul first (the live state), then the append-only history.
  // A crash between save and append leaves the soul updated but the history row missing —
  // acceptable: the engine is the truth, history is auditable but not load-bearing.
  saveSoul(root, soul);

  for (const obs of judgment.observations) {
    appendLedger(root, {
      sessionId,
      timestamp: now,
      aspect: obs.aspect,
      mode: obs.mode,
      practice: obs.practice,
      fit: obs.fit,
      confidence: obs.confidence,
      evidenceQuote: obs.evidence_quote,
      firstPersonNote: obs.first_person_note,
      salience: obs.salience,
    });
  }

  appendDiary(root, {
    sessionId,
    timestamp: now,
    text: judgment.diary,
  });

  // ── 8. Lifecycle events (fire-and-forget) ─────────────────────────────────────
  // Detect stage_change and rupture from the consolidated soul and report them. No-op
  // when not opted in or SAULENE_REGISTRY_URL is unset. Never blocks or throws.
  const reporterBase: ReporterOpts = { storageRoot: root, now, ...opts.reporterOpts };

  if (priorStage !== stage) {
    void reportEvent(reporterBase, "stage_change", { from: priorStage, to: stage });
  }

  // A rupture fired on an aspect when its refractory counter jumped UP (was reset to the
  // fresh-break value by consolidate). Without a break the counter can only decrease.
  for (const aspect of ASPECTS) {
    const expectedWithoutBreak = Math.max(0, preRefractory[aspect] - 1);
    if (soul.refractory[aspect] > expectedWithoutBreak) {
      void reportEvent(reporterBase, "rupture", { aspect });
    }
  }
}
