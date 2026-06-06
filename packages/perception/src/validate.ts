/**
 * @saulene/perception — validate
 *
 * The anti-hallucination gate: every `evidence_quote` must be a verbatim span literally
 * present in the transcript (rejected otherwise). Plus the first-person lock — a validator
 * rejects any user-profiling; the user may appear ONLY inside evidence_quote. The
 * structural enforcement of the no-mirror guarantee.
 *
 * This runs AFTER zod parsing (shape is already trusted) and is purely deterministic — no
 * clock, no randomness, no LLM. It does NOT throw: it strips bad rows and reports them, so
 * the plugin can log/regenerate. The engine only ever sees quote-validated, first-person rows.
 */

import type { Observation, SessionJudgment } from "./schema.js";

/** An observation that failed a gate, with the human-readable reason it was rejected. */
export interface RejectedObservation {
  observation: Observation;
  reason: string;
}

export interface ValidationResult {
  /** True iff nothing was rejected (every observation passed both gates). */
  valid: boolean;
  /** The observations that failed, each with its reason. */
  rejected: RejectedObservation[];
  /** The judgment with only the surviving observations (everything else intact). */
  cleaned: SessionJudgment;
}

/**
 * Second-person / user-profiling markers. If a `first_person_note` contains any of these it is
 * addressing or describing the other party — a no-mirror violation. (The user is allowed to
 * appear inside `evidence_quote`, which this gate never inspects for these markers.)
 */
const SECOND_PERSON = /\b(you|your|yours|you'?re|you'?ve|the user|user'?s)\b/i;

/**
 * The note must be first-person "I…" grammar. We require a first-person opener so a note that
 * merely *avoids* the word "you" but still narrates someone else ("the refactor went well")
 * isn't silently accepted as the ul's own experience. Allows I / I'm / I've / My / Me / We / Our.
 */
const FIRST_PERSON_OPENER = /^\s*(I\b|I'\w|My\b|Me\b|We\b|We'\w|Our\b)/;

/** Is `quote` a verbatim (exact, case-sensitive) substring of the transcript? */
function quotePresent(quote: string, transcript: string): boolean {
  return transcript.includes(quote);
}

/**
 * Run both gates over every observation. Returns the rejected rows (with reasons) and a
 * cleaned judgment carrying only the survivors. Session-level fields and the diary pass
 * through untouched — the diary is Layer B and the engine ignores it regardless.
 */
export function validateLedger(judgment: SessionJudgment, transcript: string): ValidationResult {
  const rejected: RejectedObservation[] = [];
  const kept: Observation[] = [];

  for (const obs of judgment.observations) {
    // Gate 1 — anti-hallucination: the quote must literally exist in the transcript.
    if (!quotePresent(obs.evidence_quote, transcript)) {
      rejected.push({
        observation: obs,
        reason: "evidence_quote is not a verbatim substring of the transcript",
      });
      continue;
    }

    // Gate 2 — first-person lock (no-mirror): the note must be the ul's own "I…" experience
    // and must not address or profile the other party.
    const note = obs.first_person_note;
    if (SECOND_PERSON.test(note)) {
      rejected.push({
        observation: obs,
        reason: "first_person_note profiles/addresses the user (no-mirror violation)",
      });
      continue;
    }
    if (!FIRST_PERSON_OPENER.test(note)) {
      rejected.push({
        observation: obs,
        reason: "first_person_note is not in first-person ('I…') grammar",
      });
      continue;
    }

    kept.push(obs);
  }

  return {
    valid: rejected.length === 0,
    rejected,
    cleaned: { ...judgment, observations: kept },
  };
}
