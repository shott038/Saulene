/**
 * @saulene/plugin — hooks public surface
 *
 * The lifecycle nervous system (what MCP can't provide):
 *   SessionStart → compute the ul's current personality from live soul state and inject it
 *                  (gated: only at the user's chosen level; dormant inside project work).
 *   Stop        → hand the transcript to perception → engine consolidation → age → journal
 *                  → re-derive MBTI → registry.
 *
 * This is an IO edge: supplies the real LlmClient, real clock, real filesystem.
 */

export type { LevelKind, LevelConfig } from "./config.js";
export { sauleneRoot, loadConfig, hasGitAncestor, isGated } from "./config.js";

export { AnthropicLlmClient, DEFAULT_PERCEPTION_MODEL } from "./llm.js";

export type { SessionStartOpts } from "./session-start.js";
export { sessionStart } from "./session-start.js";

export type { StopOpts } from "./stop.js";
export { stop } from "./stop.js";
