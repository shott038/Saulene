/**
 * @saulene/simulator — session script / ledger
 *
 * A scripted lifetime is just an ordered list of `ScriptedSession`s: the per-aspect signal an
 * ul "lived" each session, with NO LLM in the loop. Each session carries
 *   • `practice` — how much each aspect was exercised this session (magnitude, ≥ 0),
 *   • `fit`      — how well that exercise sat with the ul's nature (signed; negative = hated it),
 *   • `significance` — how much the session matters (drives MP/aging), normalized [0,1].
 *
 * `practice` drives the fast-loop accumulator (the ul gets more disposed toward what it does);
 * `fit` is the emotional signal that — under real practice and negative — charges tension and
 * eventually ruptures. Both feed `core` directly; the simulator never recomputes engine math.
 *
 * The authoring helpers exist so a whole life reads as a few lines: "200 sessions of high-practice,
 * high-fit on Openness/Intellect" is one `block(...)` call.
 */

import type { Aspect, AspectVector } from "@saulene/core";

/** One scripted session: the per-aspect signal an ul lived, plus how much it mattered. */
export interface ScriptedSession {
  /** How much each named aspect was exercised this session (magnitude, ≥ 0). Unnamed → 0. */
  practice: Partial<AspectVector>;
  /** How well that exercise fit the ul's nature, signed (negative = hated it). Unnamed → 0. */
  fit: Partial<AspectVector>;
  /** Session significance, normalized [0,1]; feeds `accrueMp` (aging). */
  significance: number;
}

/** Compact spec for a run of identical sessions exercising one set of aspects. */
export interface SessionBlock {
  /** The aspects exercised in every session of this block. */
  aspects: readonly Aspect[];
  /** Practice magnitude applied to each named aspect (≥ 0). */
  practice: number;
  /** Fit applied to each named aspect (signed; negative = a mismatch/grind). */
  fit: number;
  /** Significance per session [0,1]. */
  significance: number;
  /** How many identical sessions this block expands to. */
  count: number;
}

/**
 * Author one session that exercises `aspects` uniformly. The same `practice`/`fit` is applied to
 * every named aspect; everything else is left unexercised (0).
 */
export function session(
  aspects: readonly Aspect[],
  opts: { practice: number; fit: number; significance: number },
): ScriptedSession {
  const practice: Partial<AspectVector> = {};
  const fit: Partial<AspectVector> = {};
  for (const aspect of aspects) {
    practice[aspect] = opts.practice;
    fit[aspect] = opts.fit;
  }
  return { practice, fit, significance: opts.significance };
}

/** Expand a `SessionBlock` into its run of identical scripted sessions. */
export function block(spec: SessionBlock): ScriptedSession[] {
  const one = session(spec.aspects, {
    practice: spec.practice,
    fit: spec.fit,
    significance: spec.significance,
  });
  // Each session is independent data; share the reference (sessions are read-only in the loop).
  return Array.from({ length: spec.count }, () => one);
}

/** Concatenate several blocks/sessions into one lifetime script. */
export function script(...parts: (ScriptedSession | ScriptedSession[])[]): ScriptedSession[] {
  const out: ScriptedSession[] = [];
  for (const part of parts) {
    if (Array.isArray(part)) out.push(...part);
    else out.push(part);
  }
  return out;
}
