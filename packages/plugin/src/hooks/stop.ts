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
import type { Aspect, AspectVector } from "@saulene/core";
import { PerceptionError, perceiveDetailed } from "@saulene/perception";
import type { LlmClient } from "@saulene/perception";
import { appendDiary, appendLedger, defaultRoot, loadSoul, saveSoul } from "@saulene/storage";

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
}

/**
 * Stop hook handler — the perceive → consolidate → persist drift pipeline.
 *
 * Does NOT throw on `PerceptionError` — a failed observation pass is logged and skipped; the
 * soul is untouched. Callers who want retry logic can wrap this function and re-call it. Other
 * errors (storage, engine) propagate normally.
 */
export async function stop(opts: StopOpts): Promise<void> {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();
  const sessionId = opts.sessionId ?? randomUUID();

  // ── 1. Soul presence ─────────────────────────────────────────────────────────
  let soul = loadSoul(root);
  if (!soul) return; // not born yet — nothing to consolidate

  // ── 2. Perceive ───────────────────────────────────────────────────────────────
  // LLM reads the transcript and emits a bounded, evidence-cited judgment. PerceptionError
  // (malformed LLM output) is caught: we log and bail — the soul state is untouched.
  let judgment: Awaited<ReturnType<typeof perceiveDetailed>>["judgment"];
  let rejected: Awaited<ReturnType<typeof perceiveDetailed>>["rejected"];

  try {
    const result = await perceiveDetailed(opts.transcript, opts.llm);
    judgment = result.judgment;
    rejected = result.rejected;
  } catch (err) {
    if (err instanceof PerceptionError) {
      console.error("[saulene/stop] perception failed — session not consolidated:", err.message);
      return;
    }
    throw err; // unexpected errors (network, storage) propagate
  }

  if (rejected.length > 0) {
    // Stripped rows: hallucinated quotes or user-profiling attempts — logged for visibility.
    console.warn(
      `[saulene/stop] ${rejected.length} observation(s) stripped by the validation gate`,
    );
  }

  // ── 3. Signal conversion ──────────────────────────────────────────────────────
  // Aggregate per-aspect practice and fit from the sparse observation list.
  // practice ordinal 0–3 → normalize to 0–1; fit ordinal -3..+3 → normalize to -1..+1.
  // Same aspect can appear in both "task" and "interaction" modes → average across modes.
  const practiceSums: Partial<AspectVector> = {};
  const fitSums: Partial<AspectVector> = {};
  const counts: Partial<Record<Aspect, number>> = {};

  for (const obs of judgment.observations) {
    const a = obs.aspect;
    practiceSums[a] = (practiceSums[a] ?? 0) + obs.practice / 3;
    fitSums[a] = (fitSums[a] ?? 0) + obs.fit / 3;
    counts[a] = (counts[a] ?? 0) + 1;
  }

  const practiceSignal: Partial<AspectVector> = {};
  const fitSignal: Partial<AspectVector> = {};
  for (const a of ASPECTS) {
    const n = counts[a];
    if (n) {
      practiceSignal[a] = (practiceSums[a] ?? 0) / n;
      fitSignal[a] = (fitSums[a] ?? 0) / n;
    }
  }

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
  const stage = stageFromMp(soul.mp, soul);
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
}
