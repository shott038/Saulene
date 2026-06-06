/**
 * @saulene/renderer — Layer 1 render (the testable floor)
 *
 * A pure, versioned `render(soul) → RenderedInjection`. Scope is Layer 1 only — the
 * behavioral-directive rulebook that works day-1 from the 10 numbers — plus the three
 * properties the verification harness requires: per-aspect fragments, no literal trait names,
 * a deterministic soul-hash. Layers 2–5 (few-shot retrieval, spine, anti-decay re-injection,
 * drift) need the memory store + LLM and are LATER — not built here.
 *
 * PURE: imports only @saulene/core. No IO, no LLM, no clock/entropy. Same soul → byte-identical
 * injection (golden-file testable).
 */

import { ASPECTS, type Aspect, type Soul } from "@saulene/core";
import { INTENSITY_LADDER, INTERACTIONS, RENDERER_VERSION, RULEBOOK } from "./rulebook.js";
import { type VoiceOpts, buildVoiceBlock } from "./voice.js";

export { RENDERER_VERSION } from "./rulebook.js";

/** The SessionStart injection, decomposed for testability. */
export interface RenderedInjection {
  /** Assembled first-person injection. NO "## Personality" header, NO literal trait names. */
  text: string;
  /** One fragment per aspect, so the harness can ablate a single trait. Assembled into `text`. */
  fragments: Record<Aspect, string>;
  /** Deterministic hash of the soul state — stamped per transcript for exact replay. */
  soulHash: string;
  /**
   * The Layer-2 few-shot voice block folded into `text` (empty when there's no corpus). Kept as
   * a separate field for testability; NOT a per-aspect fragment, so ablation locality is exact.
   */
  voiceBlock: string;
}

/**
 * Optional Layer-2 inputs. Absent / empty `voiceSamples` ⇒ `render` returns EXACTLY today's
 * Layer-1 output (byte-identical; `voiceBlock` is `""`). With samples ⇒ the few-shot voice
 * block is folded into `text`.
 */
export type RenderOpts = VoiceOpts;

/** Pure + versioned: same (soul, opts) → same injection. */
export type RenderFn = (soul: Soul, opts?: RenderOpts) => RenderedInjection;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Continuous intensity tier for a value in [0,1]. `magnitude = |v − 0.5| · 2` measures distance
 * from the neutral midline; the tier indexes the ladder. Exposed so the harness (and our own
 * tests) can assert monotonicity directly. Same magnitude on either side of 0.5 picks the same
 * tier — the *pole* (which directive) is chosen separately by `v >= 0.5`.
 */
export function intensityTier(v: number): number {
  const magnitude = Math.abs(clamp01(v) - 0.5) * 2;
  const tier = Math.round(magnitude * (INTENSITY_LADDER.length - 1));
  return tier < 0 ? 0 : tier > INTENSITY_LADDER.length - 1 ? INTENSITY_LADDER.length - 1 : tier;
}

/**
 * Render one aspect's fragment. PURE in `v` alone — depends on no other aspect — which is what
 * makes per-aspect ablation locality exact (perturbing aspect X changes only fragment X).
 */
export function renderFragment(aspect: Aspect, v: number): string {
  const value = clamp01(v);
  const pole = value >= 0.5 ? RULEBOOK[aspect].high : RULEBOOK[aspect].low;
  const lead = INTENSITY_LADDER[intensityTier(value)];
  return `${lead} ${pole.behavior}. (e.g. ${pole.demo})`;
}

/**
 * Deterministic, pure soul-hash over the rendered-relevant state. For Layer 1 that is exactly
 * the 10 aspect values `v` — stage/age/mbti don't reach the floor yet, so they don't belong in
 * the hash (it must change iff rendered output could change). FNV-1a/32 over a canonical string;
 * no entropy, no clock.
 */
export function soulHash(soul: Soul): string {
  const canonical = ASPECTS.map((a) => `${a}=${soul.v[a]}`).join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Assemble the per-aspect fragments into coherent first-person guidance (SPEC Layer 4, the
 * cheap framing that belongs in the floor). NO `## Personality` header — a labeled block reads
 * as metadata the model reverts from. No theatrical interior-monologue. Trait-interaction
 * reconciliations (which depend on several aspects) are appended to `text` only, never folded
 * into a single fragment, so fragment-level ablation stays clean.
 */
function assemble(fragments: Record<Aspect, string>, v: Record<Aspect, number>): string {
  const intro =
    "These are my working defaults — how I actually operate, not a label to announce or a role I'm playing:";
  const lines = ASPECTS.map((a) => `- ${fragments[a]}`);
  const interactions = INTERACTIONS.filter((rule) => rule.when(v)).map(
    (rule) => `- ${rule.clause}`,
  );
  const blocks = [intro, lines.join("\n")];
  if (interactions.length > 0) {
    blocks.push(`Where those pull against each other:\n${interactions.join("\n")}`);
  }
  return blocks.join("\n\n");
}

/**
 * Concrete `RenderFn`. Pure + versioned: same (soul, opts) → byte-identical injection.
 *
 * Layer 2 is ADDITIVE. With no `voiceSamples`, `text` is exactly the Layer-1 floor and
 * `voiceBlock` is `""` — byte-identical to the pre-Layer-2 renderer. With samples, the
 * assembled few-shot voice block is appended to `text` only; `fragments` stay the pure
 * per-aspect Layer-1 fragments (ablation locality intact) and `soulHash` covers soul state
 * alone (samples/corpus are inputs, not state, so they don't move the replay hash).
 */
export function render(soul: Soul, opts: RenderOpts = {}): RenderedInjection {
  const fragments = Object.fromEntries(
    ASPECTS.map((a) => [a, renderFragment(a, soul.v[a])]),
  ) as Record<Aspect, string>;
  const layer1 = assemble(fragments, soul.v);
  const voiceBlock = buildVoiceBlock(soul, opts);
  return {
    text: voiceBlock ? `${layer1}\n\n${voiceBlock}` : layer1,
    fragments,
    soulHash: soulHash(soul),
    voiceBlock,
  };
}

export { RULEBOOK, INTENSITY_LADDER, INTERACTIONS } from "./rulebook.js";
export type { Directive, AspectRule, Interaction } from "./rulebook.js";
export {
  type VoiceSampleInput,
  type VoiceOpts,
  buildVoiceBlock,
  rankVoiceSamples,
  syntheticExemplars,
  realFraction,
  VOICE_BLOCK_SIZE,
  VOICE_FRAMING,
  CROSSFADE_HALF_SAT,
  OLD_MODEL_PENALTY,
} from "./voice.js";
