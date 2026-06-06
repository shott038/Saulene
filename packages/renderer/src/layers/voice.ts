/**
 * @saulene/renderer — Layer 2: state-matched real-voice few-shot (the pervade engine)
 *
 * Layer 1 (the rulebook floor) carries the voice day-1 from the 10 numbers alone. Layer 2
 * *pervades* as history accrues: it injects the ul's OWN past messages — the ones captured
 * when its state was nearest the current state — as "this is how you sound." Style few-shot
 * is the strongest pervade lever and also the most dangerous, so the SPEC's guardrails here
 * are load-bearing, not polish (SPEC §"Layer 2", ~432–443):
 *
 *  1. Anti-quotation + topic-orthogonal framing (MANDATORY): present samples as FORM, never
 *     content — or it content-bleeds and talks *about* old topics.
 *  2. Match the CURRENT state + decay old samples: weight by L2 state-distance and recency,
 *     so the voice never freezes at the moment the corpus got dense (the deepest critique).
 *  3. Provenance-weight down old-model samples: host-upgrade safety.
 *  4. Cold-start crossfade: synthetic prior exemplars (derived from the soul's Layer-1
 *     directives) dominate at birth → real captured samples take over as `corpusSize` grows.
 *
 * BOUNDARY: the renderer may import ONLY `@saulene/core` — never `storage`. So voice samples
 * arrive via a LOCAL input type (`VoiceSampleInput`); the plugin (which imports both) maps
 * storage's persisted `VoiceSample` into it. State-distance is reimplemented locally (a plain
 * L2 over the 10 aspects) rather than imported from storage.
 *
 * PURE: no IO, no LLM, no clock/entropy. Same (soul, opts) → byte-identical block.
 */

import { ASPECTS, type AspectVector, type Soul } from "@saulene/core";
import { RULEBOOK } from "./rulebook.js";

/**
 * A captured past message, supplied to the renderer by the plugin (mapped from storage's
 * persisted `VoiceSample`). The renderer cannot import storage, so this shape is pinned here.
 */
export interface VoiceSampleInput {
  /** The ul's own past message — FORM, not content to restate. */
  text: string;
  /** Soul aspect-vector tagged at capture; the state-distance retrieval/weight key. */
  state: AspectVector;
  /** For down-weighting old-model / stale samples on host upgrade. */
  provenance: { model: string; ageSessions: number };
}

/** Optional Layer-2 inputs to `render`. Absent / empty `voiceSamples` ⇒ pure Layer-1 floor. */
export interface VoiceOpts {
  /** State-nearest samples handed in by the plugin (storage does the retrieval). */
  voiceSamples?: VoiceSampleInput[];
  /** Total captured-corpus size, drives the cold-start crossfade. Defaults to samples.length. */
  corpusSize?: number;
}

/** Lines shown in the few-shot block (real + synthetic combined). Small on purpose. */
export const VOICE_BLOCK_SIZE = 6;

/**
 * Cold-start crossfade half-saturation: the `corpusSize` at which real samples and synthetic
 * exemplars carry EQUAL weight. Below it synthetic dominates (day-1 isn't starved); above it
 * real samples take over (Layer 1 carried the voice until the corpus got dense).
 */
export const CROSSFADE_HALF_SAT = 20;

/** Multiplier on a sample whose model differs from the freshest sample's (host-upgrade decay). */
export const OLD_MODEL_PENALTY = 0.5;

/**
 * Anti-quotation + topic-orthogonal framing — MANDATORY (SPEC). Without it the few-shot
 * content-bleeds: the model restates old topics instead of borrowing the voice. Every word
 * here is deliberately about FORM (sound, phrasing, rhythm, stance), never about content.
 */
export const VOICE_FRAMING =
  "The lines below are samples of how I SOUND — my phrasing, rhythm, and stance. " +
  "They are not things that happened or topics to revisit: match the voice, never restate or refer to what they say:";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** L2 (Euclidean) distance over the 10 aspects. Local copy — renderer can't import storage. */
function aspectDistance(x: AspectVector, y: AspectVector): number {
  let sum = 0;
  for (const a of ASPECTS) {
    const d = x[a] - y[a];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Fraction of the block that should be REAL samples at a given corpus size. A smooth
 * saturating curve `c / (c + HALF_SAT)`: 0 at birth (all synthetic), 0.5 at `HALF_SAT`,
 * → 1 as the corpus grows large. Monotone increasing — the crossfade always shifts toward
 * real as the corpus grows. Documented + exported so the crossfade is directly testable.
 */
export function realFraction(corpusSize: number): number {
  const c = corpusSize > 0 ? corpusSize : 0;
  return c / (c + CROSSFADE_HALF_SAT);
}

/**
 * Per-sample weight = state-closeness × recency × provenance. Higher = a better match for
 * the ul as it is NOW:
 *  - state-closeness `1/(1+L2)`: nearer the current state ⇒ higher (∈(0,1], 1 when identical).
 *  - recency `1/(1+ageSessions)`: older ⇒ lower (decay old samples; no freezing).
 *  - provenance: a sample whose model differs from the freshest sample's model is treated as
 *    old-model and down-weighted by `OLD_MODEL_PENALTY` (the freshest sample's model is taken
 *    as the host's current model — a pure, deterministic proxy without a clock).
 */
function sampleWeight(s: VoiceSampleInput, soul: Soul, currentModel: string): number {
  const stateClose = 1 / (1 + aspectDistance(s.state, soul.v));
  const recency = 1 / (1 + Math.max(0, s.provenance.ageSessions));
  const provenance = s.provenance.model === currentModel ? 1 : OLD_MODEL_PENALTY;
  return stateClose * recency * provenance;
}

/** The freshest sample's model = the host's current model (lowest ageSessions, stable on ties). */
function freshestModel(samples: VoiceSampleInput[]): string {
  let best: VoiceSampleInput | undefined;
  for (const s of samples) {
    if (!best || s.provenance.ageSessions < best.provenance.ageSessions) best = s;
  }
  return best?.provenance.model ?? "";
}

/**
 * Real samples ordered best-match-first (state-near, recent, current-model ahead of stale).
 * Pure, stable sort: equal-weight samples keep their supplied order. Exported for testing the
 * state-distance / provenance ordering directly.
 */
export function rankVoiceSamples(soul: Soul, samples: VoiceSampleInput[]): VoiceSampleInput[] {
  if (samples.length === 0) return [];
  const currentModel = freshestModel(samples);
  return samples
    .map((s, i) => ({ s, i, w: sampleWeight(s, soul, currentModel) }))
    .sort((p, q) => q.w - p.w || p.i - q.i) // weight desc; index asc keeps ties stable
    .map(({ s }) => s);
}

/**
 * Synthetic prior exemplars for cold-start: the soul's OWN Layer-1 micro-demonstrations for
 * its most pronounced aspects (largest `|v−0.5|`). Neutral, built-in, derived deterministically
 * from the directives the floor already renders — so day-1 voice is the ul's own shape, not a
 * generic placeholder. Strongest aspects first; ties keep `ASPECTS` order.
 */
export function syntheticExemplars(soul: Soul): string[] {
  return [...ASPECTS]
    .map((a) => ({ a, mag: Math.abs(clamp01(soul.v[a]) - 0.5) }))
    .sort((p, q) => q.mag - p.mag)
    .map(({ a }) => {
      const v = clamp01(soul.v[a]);
      return (v >= 0.5 ? RULEBOOK[a].high : RULEBOOK[a].low).demo;
    });
}

/**
 * Assemble the Layer-2 voice block, or `""` when Layer 2 is inactive (no samples ⇒ pure
 * Layer-1 floor, byte-identical to today). Real samples (best-match-first) fill a crossfade
 * share of the block; synthetic exemplars fill the rest. At low corpus the block is mostly
 * synthetic; as `corpusSize` grows real samples dominate. Always led by the mandatory
 * anti-quotation framing line.
 */
export function buildVoiceBlock(soul: Soul, opts: VoiceOpts = {}): string {
  const samples = opts.voiceSamples ?? [];
  if (samples.length === 0) return "";

  const corpusSize = opts.corpusSize ?? samples.length;
  const realSlots = Math.min(
    samples.length,
    Math.round(realFraction(corpusSize) * VOICE_BLOCK_SIZE),
  );
  const synthSlots = VOICE_BLOCK_SIZE - realSlots;

  const realLines = rankVoiceSamples(soul, samples)
    .slice(0, realSlots)
    .map((s) => s.text);
  const synthLines = syntheticExemplars(soul).slice(0, synthSlots);

  const lines = [...realLines, ...synthLines];
  if (lines.length === 0) return "";
  return [VOICE_FRAMING, lines.map((l) => `- "${l}"`).join("\n")].join("\n");
}
