/**
 * @saulene/renderer — sprite (the ul's look)
 *
 * The second pure surface of the renderer: a deterministic `Soul → SpriteParams` map
 * (SPEC § "Expression has a second surface — the *look*"). Every visual parameter is
 * grounded in the 10 aspect values, life stage, and per-ul birth-entropy jitter —
 * never arbitrary decoration. The terminal rasterizer and SVG renderer read SpriteParams;
 * they live at the plugin edge (Phase 4) and are NOT built here.
 *
 * PURE: imports only @saulene/core. No IO, no clock, no ambient entropy.
 * Same soul → byte-identical SpriteParams (golden-file testable).
 */

import { ASPECTS, type Aspect, type Soul, stageFromMp } from "@saulene/core";
import type { Stage } from "@saulene/core";
import { HUE_RAMP } from "./geometry.js";

export { SPRITE_VERSION } from "./geometry.js";

// ── helpers ──────────────────────────────────────────────────────────────────────

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Lerp a t ∈ [0,1] continuously along the HUE_RAMP array. */
function hueFromBlend(t: number): number {
  const clamped = clamp01(t);
  const len = HUE_RAMP.length;
  const x = clamped * (len - 1);
  const i = Math.min(len - 2, Math.floor(x));
  const f = x - i;
  const a = HUE_RAMP[i] as number;
  const b = HUE_RAMP[i + 1] as number;
  // shortest-arc lerp (handles hue wrap at 360°)
  const diff = b - a;
  const adj = Math.abs(diff) > 180 ? (diff > 0 ? diff - 360 : diff + 360) : diff;
  return ((a + adj * f) + 360) % 360;
}

/**
 * Deterministic per-ul birth-entropy seed — FNV-1a over the set points `s`, stubbornness,
 * and sex. These never change after birth, so the seed (and thus per-ul jitter) is fixed
 * for a ul's entire life. Two uls with identical aspect values `v` but different `s` will
 * still look different because their tilts diverge here.
 */
function birthSeed(soul: Soul): number {
  let h = 0x811c9dc5 >>> 0;
  const mix = (x: number): void => {
    const n = Math.round(x * 1e6) >>> 0;
    for (let i = 0; i < 4; i++) {
      h ^= (n >>> (i * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  for (const a of ASPECTS) mix(soul.s[a]);
  mix(soul.stubbornness);
  mix(soul.sex === "male" ? 1 : 2);
  return h >>> 0;
}

/** Seeded stateless integer hash RNG — one forward step per call (same as build-ul-types.mjs). */
function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── SpriteParams ─────────────────────────────────────────────────────────────────

/**
 * All visual parameters of a single ul frame — the output of `Soul → SpriteParams`.
 * Each parameter is grounded in specific soul state (see ASPECT_SPRITE_OWNERS below).
 * The terminal rasterizer and SVG renderer consume this struct; neither lives here.
 */
export interface SpriteParams {
  // ── Color (openness × intellect blend → hue/lightness; industriousness → saturation) ──
  /** Hue in [0, 360). Common warm terracotta (S) → rare violet (N unicorn). */
  hue: number;
  /** Saturation in [0, 100] %. Higher industriousness → more vivid. */
  saturation: number;
  /** Lightness in [0, 100] %. Common types are lighter; rare violet types richer/darker. */
  lightness: number;

  // ── Body shape (assertiveness → height; clay → width) ────────────────────────
  /** Width multiplier [0.86, 1.16]. Clay uls (low stubbornness) are wider. */
  bodyScaleX: number;
  /** Height multiplier [0.86, 1.22]. More assertive uls stand taller. */
  bodyScaleY: number;

  // ── Puff texture (orderliness → regularity; openness → crown fluff) ──────────
  /** Positional noise ± [0, 4.4] px. Low orderliness = lopsided/irregular puffs. */
  puffJitter: number;
  /** Crown-puff radius scale [0.85, 1.20]. More open uls have a fluffier top. */
  topBulge: number;
  /** Base-puff radius scale [0.90, 1.16]. Clay uls have a heavier, wider base. */
  bottomBulge: number;

  // ── Face (withdrawal → downcast; compassion → warmth; politeness → mouth) ─────
  /** Eye radius [2.6, 4.7] px. More open uls have a wider, more curious gaze. */
  eyeRadius: number;
  /** Eye spacing factor [0.76, 1.28]. More assertive uls have wider-set eyes. */
  eyeSpacingFactor: number;
  /** Eye drop in px [−2, 6.5] downward from neutral. Higher withdrawal = downcast. */
  eyeDropY: number;
  /** Warmth tint on the face [0, 1]. Directly from compassion — warm vs blank. */
  blush: number;
  /** Mouth curve [−0.5, 1.0]. Low politeness = neutral; high politeness = gentle smile. */
  mouthCurve: number;

  // ── Wisps (enthusiasm → count + length; aura/glow) ───────────────────────────
  /** Wisp count: 4 (2/side) when calm; 6 (3/side) when enthusiasm > 0.45. */
  wispCount: 4 | 6;
  /** Wisp length factor [0.70, 1.50]. More enthusiastic uls trail longer wisps. */
  wispLengthFactor: number;
  /** Aura/glow intensity [0, 1] around the cloud body. Directly from enthusiasm. */
  aura: number;

  // ── Dynamics (volatility → shimmer + tilt range; birth seed → tilt direction) ─
  /** Shimmer/sparkle density [0, 1]. Directly from volatility. */
  shimmer: number;
  /**
   * Tilt in degrees. Magnitude range [0, 8.5] scales with volatility; direction is
   * fixed at birth (from the entropy seed). Low volatility → near-upright; high → wide swing.
   */
  tilt: number;

  // ── Stage (life stage → size + detail level) ──────────────────────────────────
  /** Current life stage derived from soul.mp. */
  stage: Stage;
  /**
   * Overall size multiplier. Child is small/cute; elder dims and slightly shrinks.
   * childhood 0.75 · adolescence 0.90 · early_adulthood 1.00 · old_adulthood 0.85.
   */
  stageScale: number;

  // ── Birth-entropy seed ────────────────────────────────────────────────────────
  /**
   * FNV hash of the ul's set points + stubbornness + sex — fixed at birth, never changes.
   * Exposed so the terminal rasterizer can derive additional per-ul decorative jitter
   * (e.g., sub-pixel shimmer pattern) without re-implementing the seed math.
   */
  seed: number;
}

// ── Ablation contract ────────────────────────────────────────────────────────────

/**
 * For each aspect, the SpriteParams fields it *exclusively* drives — no other aspect
 * touches them. Used by the test suite to verify ablation locality: perturbing aspect X
 * changes exactly these fields and does NOT change the exclusive fields of any other aspect.
 *
 * Multi-aspect params (hue, lightness, topBulge, eyeRadius — shared by openness + intellect)
 * are tested separately in the golden snapshot and monotonicity tests.
 */
export const SPRITE_EXCLUSIVE: Partial<Record<Aspect, readonly (keyof SpriteParams)[]>> = {
  industriousness: ["saturation"],
  orderliness: ["puffJitter"],
  enthusiasm: ["wispLengthFactor", "aura"],
  assertiveness: ["bodyScaleY", "eyeSpacingFactor"],
  compassion: ["blush"],
  politeness: ["mouthCurve"],
  withdrawal: ["eyeDropY"],
  volatility: ["shimmer"],
};

// ── Stage scale table ─────────────────────────────────────────────────────────────

export const SPRITE_STAGE_SCALES: Record<Stage, number> = {
  childhood: 0.75, // small + cute
  adolescence: 0.9, // growing
  early_adulthood: 1.0, // full presence
  old_adulthood: 0.85, // dims and settles
};

// ── spriteParams ─────────────────────────────────────────────────────────────────

/**
 * The main mapping: `Soul → SpriteParams`. Pure and versioned — same soul yields
 * byte-identical params. Imports only @saulene/core; no IO.
 */
export function spriteParams(soul: Soul): SpriteParams {
  const v = soul.v;
  const seed = birthSeed(soul);
  const rng = rng32(seed);

  // ── Color ────────────────────────────────────────────────────────────────────
  const nBlend = clamp01(0.62 * v.openness + 0.38 * v.intellect);
  const hue = hueFromBlend(nBlend);
  const saturation = lerp(45, 90, v.industriousness);
  const lightness = lerp(82, 60, nBlend); // common = light, rare violet = richer/darker

  // ── Body shape ───────────────────────────────────────────────────────────────
  const clay = 1 - clamp01(soul.stubbornness); // clay uls (low stubbornness) are wider/rounder
  const bodyScaleX = lerp(0.86, 1.16, clay);
  const bodyScaleY = lerp(0.86, 1.22, v.assertiveness);

  // ── Puff texture ─────────────────────────────────────────────────────────────
  const puffJitter = lerp(0, 4.4, 1 - v.orderliness); // low orderliness = lopsided
  const topBulge = lerp(0.85, 1.2, v.openness); // open uls have fluffier crowns
  const bottomBulge = lerp(0.9, 1.16, clay); // clay uls have heavier bases

  // ── Face ─────────────────────────────────────────────────────────────────────
  const eyeRadius = lerp(2.6, 4.7, v.openness);
  const eyeSpacingFactor = lerp(0.76, 1.28, v.assertiveness);
  const eyeDropY = lerp(-2, 6.5, v.withdrawal); // positive = downward = more withdrawn
  const blush = clamp01(v.compassion); // warmth on the face
  const mouthCurve = lerp(-0.5, 1.0, v.politeness); // polite → gentle smile

  // ── Wisps ────────────────────────────────────────────────────────────────────
  const wispCount: 4 | 6 = v.enthusiasm > 0.45 ? 6 : 4;
  const wispLengthFactor = lerp(0.7, 1.5, v.enthusiasm);
  const aura = clamp01(v.enthusiasm);

  // ── Dynamics ─────────────────────────────────────────────────────────────────
  const shimmer = clamp01(v.volatility);
  // tilt: direction fixed at birth, range scales with volatility
  const tiltUnit = rng() - 0.5; // ∈ [−0.5, +0.5], fixed for this ul's lifetime
  const tiltRange = lerp(4, 17, v.volatility);
  const tilt = tiltUnit * 2 * tiltRange;

  // ── Stage ────────────────────────────────────────────────────────────────────
  const stage = stageFromMp(soul.mp, soul);
  const stageScale = SPRITE_STAGE_SCALES[stage];

  return {
    hue,
    saturation,
    lightness,
    bodyScaleX,
    bodyScaleY,
    puffJitter,
    topBulge,
    bottomBulge,
    eyeRadius,
    eyeSpacingFactor,
    eyeDropY,
    blush,
    mouthCurve,
    wispCount,
    wispLengthFactor,
    aura,
    shimmer,
    tilt,
    stage,
    stageScale,
    seed,
  };
}

// ── spriteHash ───────────────────────────────────────────────────────────────────

/**
 * Deterministic hash over all sprite-relevant soul state: `v` (10 aspect values),
 * `s` (birth set points → tilt direction), `stubbornness`, `sex`, and `mp` (stage).
 * Changes iff `spriteParams` output could change. FNV-1a/32 over a canonical string.
 */
export function spriteHash(soul: Soul): string {
  const parts: string[] = [];
  for (const a of ASPECTS) {
    parts.push(`v.${a}=${soul.v[a]}`);
  }
  for (const a of ASPECTS) {
    parts.push(`s.${a}=${soul.s[a]}`);
  }
  parts.push(`stub=${soul.stubbornness}`);
  parts.push(`sex=${soul.sex}`);
  parts.push(`mp=${soul.mp}`);
  const canonical = parts.join(";");
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
