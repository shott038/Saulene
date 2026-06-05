/**
 * @saulene/core — stages
 *
 * Life stages (Childhood / Adolescence / Early adulthood / Old adulthood) and aging.
 * Each stage rewrites engine rules: plasticity, set-point-pull sign+strength
 * (adolescence inverts → repulsion), and volatility. Plus MP accrual (rate-capped)
 * and stage-transition boundaries (fixed MP bands + slight per-ul randomness).
 *
 * Pure. Stage parameters are data, consumed by the engine.
 */

export type Stage = "childhood" | "adolescence" | "early_adulthood" | "old_adulthood";
