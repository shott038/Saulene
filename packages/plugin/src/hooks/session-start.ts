/**
 * @saulene/plugin — SessionStart hook handler (S1 delivery)
 *
 * Fires at the start of every Claude Code session. Handles gating, birth, and neglect-death;
 * when the session is live it renders the current voice from the soul state, writes it to the
 * session cache, and bumps `lastUsedAt`. Returns null — the voice is NOT delivered here as
 * system-prompt additionalContext (that was S0). The per-turn UserPromptSubmit hook reads the
 * cache and delivers the voice alongside each user prompt (S1 / conversation-channel position).
 *
 * SPEC: "Reminder: personality is not a static system prompt. The SessionStart hook *computes*
 * the injected personality fresh each session from the live soul state (10 values + stage +
 * mood). Soul file = numbers + history; the words are written on the fly each session."
 *
 * Side-effects: writes session-injection.json (the UserPromptSubmit cache) + bumps `lastUsedAt`.
 */

import { render } from "@saulene/renderer";
import { defaultRoot, loadSoul, readVoiceSamples, saveSoul } from "@saulene/storage";
import { reportHeartbeat } from "../reporter/reporter.js";
import { isGated, loadConfig } from "./config.js";
import { writeSessionCache } from "./session-cache.js";

import type { ReporterOpts } from "../reporter/reporter.js";

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
  /**
   * Override reporter transport/URL (for tests). In production the reporter reads
   * SAULENE_REGISTRY_URL from the env. Omitting this does not affect hook behavior.
   */
  reporterOpts?: Pick<ReporterOpts, "registryUrl" | "fetch">;
}

/** 90-day neglect-death clock in milliseconds (flat + predictable per SPEC). */
const NEGLECT_DEATH_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * SessionStart hook handler (S1 delivery). Returns `null` always — the voice is cached to disk
 * for UserPromptSubmit to deliver per-turn, not injected into the system prompt here.
 *
 * Returns `null` when dormant:
 *   - gated out (wrong level / config absent)
 *   - not yet born (no soul file)
 *   - neglect-dead (> 90 days since last use at this level)
 *
 * When live: renders the injection, writes session-injection.json (the UserPromptSubmit cache),
 * bumps `lastUsedAt`. `soulHash` in the cache is stamped for exact replay.
 */
export function sessionStart(opts: SessionStartOpts): null {
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
  // Pure: same (soul, opts) → byte-identical injection. Computed FRESH each session from the
  // live state — soul doesn't change mid-session, so this cache is valid for the whole session.
  const injection = render(soul, { voiceSamples, corpusSize });

  // ── 6. Write session cache ────────────────────────────────────────────────────
  // UserPromptSubmit reads this file each turn and delivers the voice as additionalContext
  // alongside the user prompt (S1 / conversation-channel position). No re-rendering per turn.
  writeSessionCache(root, injection);

  // ── 7. Bump lastUsedAt + save ─────────────────────────────────────────────────
  // Reset the 90-day death clock. Atomic save (rename over old file on POSIX).
  saveSoul(root, { ...soul, lastUsedAt: now });

  // ── 8. Heartbeat (fire-and-forget) ────────────────────────────────────────────
  // Signals the ul is alive + upserts its current public state on the server.
  // No-op when not opted in or SAULENE_REGISTRY_URL is unset. Never blocks or throws.
  void reportHeartbeat({ storageRoot: root, now, ...opts.reporterOpts });

  return null;
}
