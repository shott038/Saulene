/**
 * @saulene/life-sim — public surface
 *
 * Layers B + D of the surrogate pyramid:
 *   B — pay for real-CLI truth once (fingerprint corpus, ledger-source, conversation runner)
 *   D — golden closed-loop lives + felt-expression validation metrics
 *
 * Exports:
 *   1. Bucket types + helpers (the space definition)
 *   2. LedgerSource contract + CorpusLedgerSource (what W2 consumes)
 *   3. Fingerprint builder (what produces the corpus)
 *   4. Closed-loop life driver (Layer D)
 *   5. Validation metrics + ValidationJudge port (Layer D)
 *
 * The LlmClient and SyntheticUser/conversation are exported for DI + testing.
 */

export * from "./buckets.js";
export * from "./ledger-source.js";
export * from "./fingerprint.js";
export * from "./synthetic-user.js";
export * from "./conversation.js";
export { ClaudeCliClient, LifeSimCache } from "./llm.js";
export type { ClaudeCliClientOpts } from "./llm.js";
export * from "./closed-loop.js";
export * from "./validation/index.js";
