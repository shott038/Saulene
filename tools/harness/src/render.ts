/**
 * @saulene/harness — the pinned renderer↔harness contract (declared LOCALLY).
 *
 * The harness is deliberately decoupled from `@saulene/renderer`: it is parameterized over a
 * `RenderFn` injected by the caller, NOT a hard import of the renderer's concrete `render`. That
 * lets the harness compile + test green in parallel while the renderer is still a stub on `main`.
 * The renderer ships this SAME shape; at the Phase 3 tuning step the real `render` wires in here
 * with zero metric changes.
 *
 * Contract requirements the metrics rely on (SPEC §"Verifying expression — the harness"):
 *   • `text` is a first-person injection with NO literal trait names (distinctness must come from
 *     style, not self-report — otherwise the trait-recovery judge is reading a cheat sheet).
 *   • `fragments` decomposes the block per-aspect so ablation can target ONE trait at a time.
 *   • `soulHash` is a deterministic replay stamp carried into the transcript (exact replay + the
 *     identity signal the cross-soul confusion matrix attributes against).
 */

import type { Aspect, Soul } from "@saulene/core";

/** A rendered SessionStart injection — the unit of "voice" every metric scores. */
export interface RenderedInjection {
  /** First-person injection text. MUST NOT contain literal trait names. */
  text: string;
  /** Per-aspect fragments — ablation perturbs one aspect and reads the matching fragment shift. */
  fragments: Record<Aspect, string>;
  /** Deterministic replay stamp + the identity the cross-soul matrix attributes against. */
  soulHash: string;
}

/** The injected renderer the whole harness is parameterized over. Pure: same soul → same output. */
export type RenderFn = (soul: Soul) => RenderedInjection;
