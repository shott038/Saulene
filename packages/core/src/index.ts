/**
 * @saulene/core — public surface
 *
 * The engine (the truth): pure, deterministic personality math. Zero IO, zero LLM,
 * zero filesystem, zero ambient entropy/clock — time and randomness are injected.
 * See docs/ARCHITECTURE.md for why this purity is load-bearing.
 */

export * from "./state/index.js";
export * from "./engine/index.js";
export * from "./stages/index.js";
export * from "./birth/index.js";
