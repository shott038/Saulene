/**
 * @saulene/plugin — SessionStart hook handler
 *
 * Fires at the start of every Claude Code session. The gating logic runs first (so the ul
 * is dormant inside project repos even though it's installed machine-wide). When the session
 * is at the ul's chosen level, we load the soul, render the current voice fresh from the live
 * 10-float state, and return the injection text for the system prompt.
 *
 * SPEC: "SessionStart → hook injects the ul's current personality into the system prompt
 * → guaranteed embodiment, no reliance on the agent choosing to load it."
 *
 * SPEC: "Reminder: personality is not a static system prompt. The SessionStart hook *computes*
 * the injected personality fresh each session from the live soul state (10 values + stage +
 * mood). Soul file = numbers + history; the words are written on the fly each session."
 *
 * Side-effect: bumps `lastUsedAt` and saves on successful inject (resets the 90-day death clock).
 */

import { render } from "@saulene/renderer";
import type { RenderedInjection } from "@saulene/renderer";
import { defaultRoot, loadSoul, readVoiceSamples, saveSoul } from "@saulene/storage";
import { isGated, loadConfig } from "./config.js";

export interface SessionStartOpts {
  /** The working directory of the new session — the gating key. */
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
 * SessionStart hook handler. Returns the full `RenderedInjection` (text + hash) when the ul
 * should express in this session, or `null` when dormant:
 *   - gated out (wrong level / config absent)
 *   - not yet born (no soul file)
 *   - neglect-dead (> 90 days since last use at this level)
 *
 * The `text` field of the returned injection is what gets prepended to the system prompt by the
 * plugin manifest's hook wiring. `soulHash` is stamped into the transcript for exact replay.
 */
export function sessionStart(opts: SessionStartOpts): RenderedInjection | null {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();

  // ── 1. Level gating ───────────────────────────────────────────────────────────
  // Load the user's chosen level. Absent config = plugin not yet set up = dormant.
  const config = loadConfig(root);
  if (!config) return null;
  if (!isGated(config, opts.cwd)) return null;

  // ── 2. Soul presence ─────────────────────────────────────────────────────────
  // null = no soul yet (pre-birth). Dormant until the setup wizard runs.
  const soul = loadSoul(root);
  if (!soul) return null;

  // ── 3. Neglect-death check ────────────────────────────────────────────────────
  // The ul dies after 90 continuous days of non-use at its chosen level. Flat + predictable.
  if (now - soul.lastUsedAt > NEGLECT_DEATH_MS) return null;

  // ── 4. Voice corpus (Layer-2 few-shot) ────────────────────────────────────────
  // Map storage's VoiceSample shape → renderer's VoiceSampleInput shape (provenance bridge).
  // append-order: index 0 = oldest → ageSessions = corpusSize - 1 - i (0 = newest).
  const allSamples = readVoiceSamples(root);
  const corpusSize = allSamples.length;
  const voiceSamples = allSamples.map((s, i) => ({
    text: s.text,
    state: s.state,
    provenance: {
      model: s.provenance.model,
      ageSessions: corpusSize - 1 - i,
    },
  }));

  // ── 5. Render ─────────────────────────────────────────────────────────────────
  // Pure: same (soul, opts) → byte-identical injection. The whole point is this is computed
  // FRESH each session from the live state, not a static file.
  const injection = render(soul, { voiceSamples, corpusSize });

  // ── 6. Bump lastUsedAt + save ─────────────────────────────────────────────────
  // Reset the 90-day death clock. Atomic save (rename over old file on POSIX).
  saveSoul(root, { ...soul, lastUsedAt: now });

  return injection;
}
