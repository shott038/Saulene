/**
 * @saulene/perception — public surface
 *
 * Session transcript → structured, evidence-cited judgment for the engine.
 * LLM = the senses; the engine = the body. This package NEVER decides how much
 * personality changes — it emits a bounded, quote-validated ledger; @saulene/core
 * turns that into numeric change.
 *
 * The LLM is a dependency-injected `LlmClient` port — never a hardcoded SDK (that lives
 * at the plugin edge), so perception stays testable with a scripted fake.
 */

export * from "./port.js";
export * from "./schema.js";
export * from "./validate.js";
export * from "./rubric/index.js";
export * from "./perceive.js";
export * from "./signals.js";
