/**
 * @saulene/plugin — mcp/snapshot
 *
 * Pure read: loads the soul from storage and projects it through core to produce
 * the SAFE identity snapshot the MCP tools and /ul skill both surface. One shared
 * read path — no logic duplication between the two surfaces.
 *
 * SAFE vs VALUABLE: aspects, set-points, tension, stubbornness, and raw drift
 * numbers are VALUABLE and deliberately excluded from this snapshot. The engine
 * still holds those numbers in soul.json locally (it needs them to run) — this
 * read path simply does not surface them to the product UI.
 *
 * IO boundary: this module calls `loadSoul` and `readLedger` (filesystem). No LLM,
 * no clock — `now` is always injected so tests can control the death-clock position
 * without touching the real soul file.
 */

import { type MbtiLabel, type Soul, type Stage, projectMbti, stageFromMp } from "@saulene/core";
import { type LedgerRow, defaultRoot, loadSoul, readLedger } from "@saulene/storage";
import { loadKeypair } from "../identity/keypair.js";

/** How many recent ledger rows to analyze for qualitative drift by default. */
const DEFAULT_DRIFT_ROWS = 20;

export interface SnapshotOpts {
  storageRoot?: string;
  /** Unix timestamp (ms) — injected by the caller; never read from Date.now() inside. */
  now?: number;
  /** How many recent ledger rows to analyze for qualitative drift. Default: 20. */
  driftRows?: number;
}

/**
 * SAFE identity snapshot returned by the MCP tools and /ul skill.
 *
 * VALUABLE fields (aspects, set-points, tension, stubbornness, raw drift numbers)
 * are intentionally absent — they live in soul.json locally but are not surfaced
 * here. The gallery (paid) is where users can see their full breakdown.
 */
export interface UlSnapshot {
  /** Current life stage. */
  stage: Stage;
  /** Maturity points (age proxy — session-count weighted by significance). */
  mp: number;
  /** MBTI projection (display-only, derived from the 10 aspects internally). */
  mbti: MbtiLabel;
  /** Birth attribute. */
  sex: Soul["sex"];
  /** Epoch-ms of last use (the 90-day death clock anchor). */
  lastUsedAt: number;
  /** Days remaining until neglect-death. Negative = already past the threshold. */
  daysUntilDeath: number;
  /** True when `daysUntilDeath < 0`. */
  isDead: boolean;
  /**
   * The ul's permanent public ID (base58 ed25519 pubkey). Present after first birth;
   * absent for uls born before this feature was added.
   */
  publicId: string | null;
  /**
   * Qualitative description of recent personality drift — no raw numbers.
   * Empty when no recent ledger activity exists.
   */
  qualitativeDrift: string[];
}

// Per-aspect qualitative descriptors: [positive-fit label, negative-fit label].
const DRIFT_LABELS: Record<string, [string, string]> = {
  openness: ["more open to new ideas", "more reserved in outlook"],
  intellect: ["more intellectually exploratory", "sticking to familiar ground"],
  industriousness: ["more driven and effortful", "pacing yourself more"],
  orderliness: ["more structured and organized", "more flexible with routines"],
  enthusiasm: ["warmer and more engaging", "quieter and more contained"],
  assertiveness: ["more direct and assertive", "more collaborative in approach"],
  compassion: ["more attuned to others", "more focused inward"],
  politeness: ["more accommodating", "more frank and direct"],
  withdrawal: ["leaning into inward time", "more socially present"],
  volatility: ["experiencing more emotional flux", "steadier emotionally"],
};

/**
 * Build qualitative drift phrases from ledger rows — no numbers in the output.
 * Returns up to 3 phrases for the most-practiced aspects.
 */
function buildQualitativeDrift(rows: LedgerRow[]): string[] {
  if (rows.length === 0) return [];

  const agg = new Map<string, { totalPractice: number; fitSum: number; count: number }>();
  for (const row of rows) {
    const existing = agg.get(row.aspect);
    if (existing) {
      existing.totalPractice += row.practice;
      existing.fitSum += row.fit;
      existing.count += 1;
    } else {
      agg.set(row.aspect, { totalPractice: row.practice, fitSum: row.fit, count: 1 });
    }
  }

  const sorted = [...agg.entries()]
    .filter(([, a]) => a.totalPractice >= 1)
    .sort((a, b) => b[1].totalPractice - a[1].totalPractice)
    .slice(0, 3);

  return sorted.map(([aspect, a]) => {
    const labels = DRIFT_LABELS[aspect];
    if (!labels) return `showing variation in ${aspect}`;
    const avgFit = a.fitSum / a.count;
    const descriptor = avgFit >= 0 ? labels[0] : labels[1];
    return `leaning ${descriptor} lately`;
  });
}

/**
 * Compute the SAFE identity snapshot. Returns `null` when no soul exists (not yet born).
 *
 * Does NOT check the neglect-death gate — the snapshot is always returned even for a dead ul
 * so callers can show the countdown. `isDead` and `daysUntilDeath` signal death state.
 *
 * VALUABLE fields (aspects, set-points, tension, stubbornness, raw drift) are intentionally
 * excluded — the engine needs them locally but the product UI does not surface them.
 */
export function snapshot(opts: SnapshotOpts = {}): UlSnapshot | null {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();
  const driftRows = opts.driftRows ?? DEFAULT_DRIFT_ROWS;

  const soul = loadSoul(root);
  if (!soul) return null;

  const stage = stageFromMp(soul.mp, soul);
  const mbti = projectMbti(soul.v);

  const msElapsed = now - soul.lastUsedAt;
  const daysElapsed = msElapsed / (1000 * 60 * 60 * 24);
  const daysUntilDeath = 90 - daysElapsed;
  const isDead = daysUntilDeath < 0;

  const allLedger = readLedger(root);
  const recentRows = allLedger.slice(-driftRows);
  const qualitativeDrift = buildQualitativeDrift(recentRows);

  const keypair = loadKeypair(root);

  return {
    stage,
    mp: soul.mp,
    mbti,
    sex: soul.sex,
    lastUsedAt: soul.lastUsedAt,
    daysUntilDeath,
    isDead,
    publicId: keypair?.publicId ?? null,
    qualitativeDrift,
  };
}
