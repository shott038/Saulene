/**
 * @saulene/core — engine
 *
 * The evolution engine: how judgment becomes change. Pure, deterministic, closed-form
 * per step (so a whole lifetime replays in milliseconds).
 *
 * Owns: the fast-loop accumulator charge, the consolidation update rule
 * (nurture force room-bounded + linear set-point spring), tension charging,
 * breaking points (clay reconfigures / stubborn hardens), set-point migration
 * (rare, capped), and sticky decay-floor atrophy.
 *
 * Does NOT own: stage/plasticity values (see ../stages), birth seeding (see ../birth),
 * or any IO/LLM (that's the plugin edge).
 */

// TODO(core): GlobalKnobs (α, β, λ, ρ, θ, J, refractory, atrophyRate, κ).
// TODO(core): charge(soul, ledger) — fast loop.
// TODO(core): consolidate(soul, knobs, stage) — slow loop (update rule + tension + breaks + atrophy).

export {};
