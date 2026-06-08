/**
 * @saulene/plugin — perception throttle state + single-flight lock + transcript delta
 *
 * The Stop hook fires once per ASSISTANT TURN, not once per session. Left unthrottled it would
 * spawn a headless `claude -p` perception after every turn AND re-read the whole transcript each
 * time (re-perceiving — and re-drifting — old turns). This module is the cheap on-disk machinery
 * that fixes both:
 *
 *   1. **Throttle** — `perception-state.json` persists `lastPerceivedAt` (ms). The hook only
 *      perceives when at least `interval` ms have elapsed since the last attempt.
 *   2. **Single-flight lock** — `perception.lock` (pid + ts) guards the spawn so two perceptions
 *      never run at once, even across two simultaneously-open Claude Code sessions. A held FRESH
 *      lock makes the hook skip; a STALE lock (older than a TTL) or a DEAD pid is taken over.
 *   3. **Delta** — `watermark` (the newest perceived message timestamp, ms) lets the hook feed
 *      perception only the transcript lines AFTER the watermark, so no turn is drifted twice.
 *
 * All IO takes an injected `root`; the clock (`now`), interval, and TTL are passed in so the Stop
 * hook stays deterministic under test. No `Date.now()`, no network, no engine math here.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_FILENAME = "perception-state.json";
const LOCK_FILENAME = "perception.lock";

/** Default minimum interval between perceptions (15 min). Override via env. */
export const DEFAULT_PERCEPTION_INTERVAL_MS = 15 * 60 * 1000;
/** Default lock TTL — a lock older than this is considered stale and taken over (10 min). */
export const DEFAULT_LOCK_TTL_MS = 10 * 60 * 1000;

/** The on-disk throttle/delta state. Absent or malformed → the safe default below. */
export interface PerceptionState {
  /** Epoch ms of the last perception ATTEMPT (advanced even on failure, to throttle retries). */
  lastPerceivedAt: number;
  /** Epoch ms of the newest message perceived so far; `null` before the first successful pass. */
  watermark: number | null;
}

const DEFAULT_STATE: PerceptionState = { lastPerceivedAt: 0, watermark: null };

export const statePath = (root: string): string => join(root, STATE_FILENAME);
export const lockPath = (root: string): string => join(root, LOCK_FILENAME);

/**
 * Resolve the throttle interval: env `SAULENE_PERCEPTION_INTERVAL_MS` (a positive integer) wins,
 * else the 15-min default. A non-numeric / non-positive env value is ignored.
 */
export function resolveIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SAULENE_PERCEPTION_INTERVAL_MS;
  if (raw !== undefined) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PERCEPTION_INTERVAL_MS;
}

/**
 * Load `<root>/perception-state.json`. Returns the safe default (perceive-now, no watermark) when
 * the file is absent or malformed — never throws, never blocks the hook.
 */
export function loadPerceptionState(root: string): PerceptionState {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(statePath(root), "utf8"));
  } catch {
    return { ...DEFAULT_STATE };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_STATE };
  const obj = raw as Record<string, unknown>;
  const lastPerceivedAt = typeof obj.lastPerceivedAt === "number" ? obj.lastPerceivedAt : 0;
  const watermark = typeof obj.watermark === "number" ? obj.watermark : null;
  return { lastPerceivedAt, watermark };
}

/** Persist the throttle/delta state. Creates the root dir if needed. */
export function savePerceptionState(root: string, state: PerceptionState): void {
  const file = statePath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

interface LockInfo {
  pid: number;
  ts: number;
}

/** Default liveness check: signal 0 probes the process without killing it. */
function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM → the process exists but is owned by another user; ESRCH → it's gone.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface AcquireLockOpts {
  /** Epoch ms — injected, never read from the clock here. */
  now: number;
  /** A lock older than this is stale and gets taken over. */
  ttlMs: number;
  /** Our pid (default `process.pid`); injectable for tests. */
  pid?: number;
  /** Liveness probe (default uses `process.kill(pid, 0)`); injectable for tests. */
  isAlive?: (pid: number) => boolean;
}

/**
 * Try to acquire the single-flight perception lock.
 *
 * Returns `true` if we now hold it, `false` if another live perception holds a FRESH lock (the
 * caller should then skip — no second spawn, no queue). A missing lock, a STALE lock (older than
 * `ttlMs`), a DEAD-pid lock, or a corrupt lock file is taken over.
 *
 * The happy path uses an exclusive (`wx`) create so two simultaneous sessions can't both win.
 */
export function acquireLock(root: string, opts: AcquireLockOpts): boolean {
  const { now, ttlMs, pid = process.pid, isAlive = defaultIsAlive } = opts;
  const file = lockPath(root);
  mkdirSync(dirname(file), { recursive: true });
  const mine = JSON.stringify({ pid, ts: now } satisfies LockInfo);

  try {
    writeFileSync(file, mine, { flag: "wx" }); // atomic create-if-absent
    return true;
  } catch {
    // Lock file already exists — inspect whether it's genuinely held.
    let info: LockInfo | null = null;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed && typeof parsed.pid === "number" && typeof parsed.ts === "number") {
        info = parsed as LockInfo;
      }
    } catch {
      info = null; // corrupt → treat as takeable
    }

    const fresh = info !== null && now - info.ts < ttlMs;
    const alive = info !== null && isAlive(info.pid);
    if (fresh && alive) return false; // genuinely held by a live, recent perception

    // Stale, dead, or corrupt → take it over.
    try {
      writeFileSync(file, mine);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Release the lock — ALWAYS call this in a `finally` so a crash can't wedge perception forever.
 * Only removes the file if it's still ours (pid match), so we never release a lock another session
 * took over after we went stale. Missing file / read errors are swallowed.
 */
export function releaseLock(root: string, pid: number = process.pid): void {
  const file = lockPath(root);
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as LockInfo;
    if (parsed?.pid !== pid) return; // someone else took it over — leave it alone
  } catch {
    // Unreadable/corrupt — fall through and attempt removal anyway.
  }
  try {
    rmSync(file, { force: true });
  } catch {
    // best-effort
  }
}

/** The result of slicing a transcript to its un-perceived tail. */
export interface SliceResult {
  /** The transcript portion to feed perception (only lines newer than the watermark). */
  sliceText: string;
  /** The watermark to persist ON SUCCESS — the newest message timestamp seen (ms), or `null`. */
  newWatermark: number | null;
}

/**
 * Slice a JSONL transcript to only the lines newer than `watermark`.
 *
 * The Claude Code transcript is JSONL (one message/line); message lines carry an ISO-8601
 * `timestamp`. We keep lines whose timestamp is strictly greater than the watermark and report
 * the newest timestamp seen as `newWatermark` (advance it only on a successful perception, so a
 * failed pass re-tries the same delta).
 *
 * Robustness: untimestamped metadata lines (mode/color/etc.) are dropped from the delta. If NO
 * line has a parseable timestamp (unexpected format), we FALL BACK to feeding the whole transcript
 * and leave the watermark unchanged — degrade, never crash.
 */
export function sliceTranscript(rawTranscript: string, watermark: number | null): SliceResult {
  const lines = rawTranscript.split("\n");
  let maxTs: number | null = null;
  let sawTimestamp = false;
  const kept: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") continue;
    let ts: number | null = null;
    try {
      const obj = JSON.parse(line) as { timestamp?: unknown };
      if (typeof obj.timestamp === "string") {
        const parsed = Date.parse(obj.timestamp);
        if (!Number.isNaN(parsed)) ts = parsed;
      }
    } catch {
      // Non-JSON line — has no timestamp; ignored in delta mode.
    }
    if (ts === null) continue;
    sawTimestamp = true;
    if (maxTs === null || ts > maxTs) maxTs = ts;
    if (watermark === null || ts > watermark) kept.push(line);
  }

  // No parseable timestamps anywhere → can't slice reliably; perceive the whole thing as before.
  if (!sawTimestamp) return { sliceText: rawTranscript, newWatermark: watermark };

  return { sliceText: kept.join("\n"), newWatermark: maxTs };
}
