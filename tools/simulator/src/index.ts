/**
 * @saulene/simulator
 *
 * Drives synthetic lifetimes through the pure engine: scripted ledgers (no real LLM)
 * → charge → consolidate → age, across years of synthetic sessions in milliseconds.
 * The acceptance test the SPEC names: same seed, two usage patterns (aligned vs
 * mismatched grind) → two genuinely different adults, and you can narrate exactly why.
 *
 * Dev-only. Build this right after the engine (before the plugin), per ARCHITECTURE.md.
 */

export {
  type ScriptedSession,
  type SessionBlock,
  session,
  block,
  script,
} from "./script.js";
export {
  type TrajectorySnapshot,
  type BreakEvent,
  type Trajectory,
  lifetime,
  entropyFromInt,
} from "./lifetime.js";
export { narrate, describeBirth } from "./narrate.js";
