/**
 * @saulene/harness
 *
 * The verification harness — BUILD THIS FIRST (the uncontested piece; it's how every
 * expression layer gets tuned). Five metrics over replayed synthetic lifetimes:
 *   1. Trait-recovery / anti-sticker detector (core metric)
 *   2. Cross-soul confusion matrix
 *   3. Longitudinal trajectory (perceptible net drift, continuous step-to-step)
 *   4. Stage silhouette
 *   5. Per-aspect ablation sensitivity
 *
 * Requires the renderer to emit per-aspect fragments, forbid literal trait names, use a
 * fixed versioned prompt battery, and stamp a deterministic soul-hash for exact replay.
 *
 * Dev-only.
 */

// TODO(harness): the five metrics + a judge-LLM port (injected, fakeable).

export {};
