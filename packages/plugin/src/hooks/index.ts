/**
 * @saulene/plugin — hooks public surface
 *
 * The lifecycle nervous system (what MCP can't provide):
 *   SessionStart      → gating + birth/death check + render + cache write + lastUsedAt bump.
 *                       Returns null (S1 delivery: voice goes through UserPromptSubmit, not here).
 *   UserPromptSubmit  → reads the session cache, returns voice as additionalContext alongside the
 *                       user's prompt (conversation-channel / S1 position, 0.71 distinguishability).
 *   Stop              → hand the transcript to perception → engine consolidation → age → journal.
 *
 * Manifest wiring note (S1 delivery):
 *   - Wire UserPromptSubmit hook to call userPromptSubmit() and return its text as additionalContext.
 *   - Wire SessionStart hook to call sessionStart() for side effects only — do NOT wire its return
 *     value as additionalContext (it returns null; the voice must come from UserPromptSubmit).
 *
 * This is an IO edge: supplies the real LlmClient, real clock, real filesystem.
 */

export type { LevelKind, LevelConfig } from "./config.js";
export { sauleneRoot, loadConfig, hasGitAncestor, isGated } from "./config.js";

export { AnthropicLlmClient, DEFAULT_PERCEPTION_MODEL } from "./llm.js";

export type { SessionCacheEntry } from "./session-cache.js";
export { writeSessionCache, readSessionCache } from "./session-cache.js";

export type { SessionStartOpts } from "./session-start.js";
export { sessionStart } from "./session-start.js";

export type { UserPromptSubmitOpts } from "./user-prompt-submit.js";
export { userPromptSubmit } from "./user-prompt-submit.js";

export type { StopOpts } from "./stop.js";
export { stop } from "./stop.js";
