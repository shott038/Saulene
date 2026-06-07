/**
 * @saulene/plugin — level config + session gating
 *
 * The ul is installed globally but only EXPRESSES at its chosen level (global or named-dir).
 * The SessionStart hook calls `loadConfig` + `isGated` every session; if dormant, it exits
 * without injecting (the ul still exists + ages; it just doesn't express).
 *
 * Config file: `<storageRoot>/config.json` — written by the setup wizard (a separate brick).
 * If absent the plugin is dormant on every session (not yet set up).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";

/** The two levels a user can choose in the setup wizard. */
export type LevelKind = "global" | "named-dir";

export interface LevelConfig {
  /** Where the ul expresses — chosen once in the setup wizard. */
  level: LevelKind;
  /**
   * Only present when `level === "named-dir"`. Absolute path of the directory the ul lives in.
   * Inject when cwd is this dir OR any path inside it.
   */
  dir?: string;
}

const CONFIG_FILENAME = "config.json";

/** The default on-disk storage root (`~/.saulene`). */
export function sauleneRoot(): string {
  return join(homedir(), ".saulene");
}

/**
 * Load the level config from `<storageRoot>/config.json`.
 * Returns `null` when the file is absent (plugin not yet set up) or malformed (safe default:
 * dormant rather than inject-everywhere on a corrupted config).
 */
export function loadConfig(storageRoot: string = sauleneRoot()): LevelConfig | null {
  const file = join(storageRoot, CONFIG_FILENAME);
  if (!existsSync(file)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null; // malformed JSON → dormant
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.level !== "global" && obj.level !== "named-dir") return null;

  const config: LevelConfig = { level: obj.level as LevelKind };
  if (config.level === "named-dir" && typeof obj.dir === "string") {
    config.dir = obj.dir;
  }
  return config;
}

/**
 * Persist the level config to `<storageRoot>/config.json`.
 * Creates the directory if needed. Called once by the setup wizard after the user picks a level.
 */
export function saveConfig(storageRoot: string, config: LevelConfig): void {
  const file = join(storageRoot, CONFIG_FILENAME);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Walk up the directory tree from `dir` looking for a `.git` directory. Returns `true` if
 * found, meaning `dir` is inside a git project. Synchronous; reads only directory entries,
 * not file contents.
 */
export function hasGitAncestor(dir: string): boolean {
  let current = dir;
  for (;;) {
    if (existsSync(join(current, ".git"))) return true;
    const parent = join(current, "..");
    // On POSIX, `join("/", "..")` is `"/"` — detect the root by checking identity.
    if (parent === current) return false;
    current = parent;
  }
}

/**
 * True when the session at `cwd` is at the ul's chosen level and should inject.
 *
 * - **"global"**: inject when `cwd` is NOT inside a git repository. This is the proxy for
 *   "general session" vs "project session" — the SPEC invariant: a ul set to global never
 *   expresses inside project work.
 * - **"named-dir"**: inject when `cwd` is at or inside the configured directory.
 */
export function isGated(config: LevelConfig, cwd: string): boolean {
  if (config.level === "named-dir") {
    const dir = config.dir;
    if (!dir) return false;
    const normalized = dir.endsWith(sep) ? dir : dir + sep;
    return cwd === dir || cwd.startsWith(normalized);
  }
  // "global": inject only outside project repos (no .git ancestor).
  return !hasGitAncestor(cwd);
}
