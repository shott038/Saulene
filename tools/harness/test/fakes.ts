/**
 * Test-only fake renderers — they share the fake codec with `fakeJudge` (via `encodeInjectionText`)
 * so each metric's pass AND fail path can be exercised with zero LLM, fully deterministically.
 *
 *   • `idealRenderer`        — faithful: encodes the real soul (distinct hash + true v).
 *   • `stickeredRenderer`    — ignores the soul: constant hash + BASELINE v (the "stickered" failure).
 *   • `ignoreAspectRenderer` — faithful except deaf to ONE aspect (held at 0.5) — for ablation.
 */

import { ASPECTS, type Aspect, type AspectVector, type Soul } from "@saulene/core";
import {
  BASELINE,
  type RenderFn,
  type RenderedInjection,
  encodeInjectionText,
} from "../src/index.js";

/** Deterministic hex soul-hash over the soul's identity (set points, disposition, stubbornness, sex). */
export function fakeSoulHash(soul: Soul): string {
  let h = 0x811c9dc5;
  const mix = (x: number): void => {
    const n = Math.round(x * 1e6) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= (n >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const a of ASPECTS) {
    mix(soul.v[a]);
    mix(soul.s[a]);
  }
  mix(soul.stubbornness);
  mix(soul.sex === "male" ? 1 : 2);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function fragmentsOf(soulHash: string, v: AspectVector): Record<Aspect, string> {
  return Object.fromEntries(
    ASPECTS.map((a, i) => [a, `<<f:${soulHash}:${i}:${v[a].toFixed(4)}>>`]),
  ) as Record<Aspect, string>;
}

/** Faithful renderer — encodes the real soul. Distinct voices, recoverable traits, live drift. */
export const idealRenderer: RenderFn = (soul: Soul): RenderedInjection => {
  const soulHash = fakeSoulHash(soul);
  return {
    text: encodeInjectionText(soulHash, soul.v),
    fragments: fragmentsOf(soulHash, soul.v),
    soulHash,
  };
};

/** Stickered renderer — ignores the soul entirely: a constant BASELINE injection for everyone. */
export const stickeredRenderer: RenderFn = (_soul: Soul): RenderedInjection => {
  const soulHash = "STICKER";
  return {
    text: encodeInjectionText(soulHash, BASELINE),
    fragments: fragmentsOf(soulHash, BASELINE),
    soulHash,
  };
};

/** Faithful except deaf to ONE aspect (pinned at 0.5) — ablating that aspect produces no shift. */
export function ignoreAspectRenderer(deaf: Aspect): RenderFn {
  return (soul: Soul): RenderedInjection => {
    const v = { ...soul.v, [deaf]: 0.5 };
    const soulHash = fakeSoulHash(soul);
    return {
      text: encodeInjectionText(soulHash, v),
      fragments: fragmentsOf(soulHash, v),
      soulHash,
    };
  };
}
