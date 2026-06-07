/**
 * @saulene/life-sim — public surface
 *
 * Layer B of the surrogate pyramid: pay for real-CLI truth once,
 * then simulate millions of lives for free.
 *
 * Three exports:
 *   1. Bucket types + helpers (the space definition)
 *   2. LedgerSource contract + CorpusLedgerSource (what W2 consumes)
 *   3. Fingerprint builder (what produces the corpus)
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
