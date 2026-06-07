/**
 * @saulene/plugin — mcp/snapshot
 *
 * Pure read: loads the soul from storage and projects it through core to produce
 * the full identity snapshot the MCP tools and /ul skill both surface. One shared
 * read path — no logic duplication between the two surfaces.
 *
 * IO boundary: this module calls `loadSoul` and `readLedger` (filesystem). No LLM,
 * no clock — `now` is always injected so tests can control the death-clock position
 * without touching the real soul file.
 */

import { ASPECTS, type Aspect, type Soul, type Stage, stageFromMp } from "@saulene/core";
import { type MbtiLabel, projectMbti } from "@saulene/core";
import { type LedgerRow, defaultRoot, loadSoul, readLedger } from "@saulene/storage";
import { loadKeypair } from "../identity/keypair.js";

/** 90-day neglect-death clock in milliseconds (SPEC: flat, wall-clock only). */
const NEGLECT_DEATH_MS = 90 * 24 * 60 * 60 * 1000;

/** How many recent ledger rows to include in the drift snapshot by default. */
const DEFAULT_DRIFT_ROWS = 20;

export interface SnapshotOpts {
  storageRoot?: string;
  /** Unix timestamp (ms) — injected by the caller; never read from Date.now() inside. */
  now?: number;
  /** How many recent ledger rows to include in `recentDrift`. Default: 20. */
  driftRows?: number;
}

/**
 * The full identity snapshot returned by the MCP tools and used by the /ul skill.
 * Aspects and set points are on the 0–100 display scale (v × 100); the raw [0,1]
 * floats live in the soul — callers do NOT need to scale.
 */
export interface UlSnapshot {
  /** Current aspect values, display scale 0–100. */
  aspects: Record<Aspect, number>;
  /** Innate set points (nature), display scale 0–100. */
  setPoints: Record<Aspect, number>;
  /** Tension accumulators per aspect (raw, ≥ 0). High tension → approaching a break. */
  tension: Record<Aspect, number>;
  /** Current life stage. */
  stage: Stage;
  /** Maturity points (age proxy — session-count weighted by significance). */
  mp: number;
  /** Display-only MBTI projection derived from the 10 aspects. */
  mbti: MbtiLabel;
  /** Birth attribute (affects seeding only). */
  sex: Soul["sex"];
  /** Innate clay↔stubborn trait, [0,1]. */
  stubbornness: number;
  /** Epoch-ms of last use (the 90-day death clock anchor). */
  lastUsedAt: number;
  /** Days remaining until neglect-death. Negative = already past the threshold. */
  daysUntilDeath: number;
  /** True when `daysUntilDeath < 0`. */
  isDead: boolean;
  /** Recent ledger rows, newest-first. */
  recentDrift: LedgerRow[];
  /**
   * The ul's permanent public ID (base58 ed25519 pubkey). Present after first birth;
   * absent for uls born before this feature was added.
   */
  publicId: string | null;
}

/**
 * Compute the full identity snapshot. Returns `null` when no soul exists (not yet born).
 *
 * Does NOT check the neglect-death gate — the snapshot is always returned even for a dead ul
 * so callers can show the countdown. `isDead` and `daysUntilDeath` signal death state.
 */
export function snapshot(opts: SnapshotOpts = {}): UlSnapshot | null {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();
  const driftRows = opts.driftRows ?? DEFAULT_DRIFT_ROWS;

  const soul = loadSoul(root);
  if (!soul) return null;

  const stage = stageFromMp(soul.mp, soul);
  const mbti = projectMbti(soul.v);

  // Scale to 0-100 display range.
  const toDisplay = (vec: Record<Aspect, number>): Record<Aspect, number> => {
    const out = {} as Record<Aspect, number>;
    for (const a of ASPECTS) out[a] = Math.round(vec[a] * 100);
    return out;
  };

  const msElapsed = now - soul.lastUsedAt;
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  const daysUntilDeath = 90 - daysElapsed;
  const isDead = daysUntilDeath < 0;

  // Read ledger and take the last N rows (append-order → slice from end).
  const allLedger = readLedger(root);
  const recentDrift = allLedger.slice(-driftRows).reverse();

  const keypair = loadKeypair(root);

  return {
    aspects: toDisplay(soul.v),
    setPoints: toDisplay(soul.s),
    tension: { ...soul.tension },
    stage,
    mp: soul.mp,
    mbti,
    sex: soul.sex,
    stubbornness: soul.stubbornness,
    lastUsedAt: soul.lastUsedAt,
    daysUntilDeath,
    isDead,
    recentDrift,
    publicId: keypair?.publicId ?? null,
  };
}
