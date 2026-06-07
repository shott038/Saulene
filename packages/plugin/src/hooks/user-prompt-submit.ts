/**
 * @saulene/plugin — UserPromptSubmit hook handler (S1 delivery)
 *
 * Fires on every user prompt. Reads the session cache written by SessionStart and returns the
 * rendered voice as additionalContext alongside the user's message — the S1 / conversation-channel
 * delivery position (0.33 → 0.71 blind distinguishability vs system-prompt injection).
 *
 * No rendering here: the voice is pure in the soul state (same soul → byte-identical injection),
 * so the cache from SessionStart is valid for the entire session. Reading it is cheap I/O.
 *
 * Returns null (dormant) when:
 *   - gated out (wrong level / config absent)
 *   - not yet born (no soul file)
 *   - neglect-dead (> 90 days since last use)
 *   - no session cache (SessionStart was dormant or hasn't run)
 */

import { defaultRoot, loadSoul } from "@saulene/storage";
import { isGated, loadConfig } from "./config.js";
import { type SessionCacheEntry, readSessionCache } from "./session-cache.js";

export interface UserPromptSubmitOpts {
  /** The working directory of the session — the gating key. */
  cwd: string;
  /**
   * Storage root; defaults to `~/.saulene`. Tests pass a temp dir so the real soul is never
   * touched.
   */
  storageRoot?: string;
  /** Unix timestamp (ms) — injected by the caller, never read from Date.now() inside. */
  now?: number;
}

/** 90-day neglect-death clock in milliseconds (flat + predictable per SPEC). */
const NEGLECT_DEATH_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * UserPromptSubmit hook handler. Returns the cached injection when the session is live, or
 * `null` when dormant. The caller returns `injection.text` as `additionalContext` in the hook
 * response — Claude Code delivers it alongside the user's prompt in the conversation channel.
 */
export function userPromptSubmit(opts: UserPromptSubmitOpts): SessionCacheEntry | null {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();

  // ── 1. Level gating ───────────────────────────────────────────────────────────
  const config = loadConfig(root);
  if (!config) return null;
  if (!isGated(config, opts.cwd)) return null;

  // ── 2. Soul presence + neglect-death ─────────────────────────────────────────
  const soul = loadSoul(root);
  if (!soul) return null;
  if (now - soul.lastUsedAt > NEGLECT_DEATH_MS) return null;

  // ── 3. Session cache ──────────────────────────────────────────────────────────
  // If SessionStart ran and was live, the cache exists with the rendered voice for this session.
  // If SessionStart was dormant (or hasn't run), readSessionCache returns null → dormant.
  return readSessionCache(root);
}
