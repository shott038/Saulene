/**
 * @saulene/perception — the LLM port
 *
 * The model is dependency-injected, never a hardcoded SDK (that lives at the plugin edge),
 * so perception stays testable with a scripted fake. Perception treats `complete`'s return
 * as an UNTRUSTED string — it is JSON-parsed, zod-validated, and quote-gated before any of it
 * reaches the engine.
 */

/** Port the plugin implements with a real model; the simulator/tests fake it. */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}
