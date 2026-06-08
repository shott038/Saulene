/**
 * @saulene/plugin — enable the ul statusline (merge into ~/.claude/settings.json)
 *
 * Plugins can't declare a statusLine, so this writes one into the user's settings.
 * Idempotent + non-destructive: it MERGES a statusLine block, preserving every other
 * key, and refuses to write if the existing file is present-but-unparseable (never
 * clobber the user's real global config).
 *
 * Version stability: rather than baking a versioned absolute path into settings (which
 * breaks on every plugin update), we write a tiny launcher to `<sauleneRoot>/
 * statusline-launch.sh` that resolves the NEWEST installed statusline.js at run time,
 * and point settings.json at that launcher. Settings never need rewriting on update.
 *
 * Env overrides (for non-destructive live verification — harmless in prod):
 *   SAULENE_ROOT          → launcher dir base (default ~/.saulene)
 *   CLAUDE_SETTINGS_PATH  → settings.json path (default ~/.claude/settings.json)
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRoot } from "@saulene/storage";
import { buildLauncherScript, mergeStatusLineSettings } from "../statusline/enable.js";

/** Modest re-run timer (seconds) — a calm breath of life without a per-second process. */
const REFRESH_INTERVAL = 10;

function main(): void {
  const sauleneRoot = process.env.SAULENE_ROOT || defaultRoot();
  const settingsPath =
    process.env.CLAUDE_SETTINGS_PATH || join(homedir(), ".claude", "settings.json");

  // ── Resolve paths relative to THIS bundled file ───────────────────────────────
  // At runtime this is `.../<version>/packages/plugin/dist/bin/enable-statusline.js`.
  const selfDir = dirname(fileURLToPath(import.meta.url));
  const statuslineTarget = join(selfDir, "statusline.js");
  // bin → dist → plugin → packages → <version>;  cacheBase = the dir holding all versions.
  const versionDir = resolve(selfDir, "..", "..", "..", "..");
  const cacheBase = dirname(versionDir);

  // ── Write the version-stable launcher ─────────────────────────────────────────
  mkdirSync(sauleneRoot, { recursive: true });
  const launcherPath = join(sauleneRoot, "statusline-launch.sh");
  writeFileSync(launcherPath, buildLauncherScript(cacheBase, statuslineTarget), "utf8");
  chmodSync(launcherPath, 0o755);

  // ── Read existing settings (never clobber on parse failure) ───────────────────
  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    const raw = readFileSync(settingsPath, "utf8").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          existing = parsed as Record<string, unknown>;
        } else {
          process.stderr.write(
            `Refusing to overwrite ${settingsPath}: not a JSON object. Left unchanged.\n`,
          );
          process.exit(1);
        }
      } catch {
        process.stderr.write(
          `Refusing to overwrite ${settingsPath}: invalid JSON. Left unchanged.\n`,
        );
        process.exit(1);
      }
    }
  }

  // ── Merge + write back ────────────────────────────────────────────────────────
  const command = `sh ${JSON.stringify(launcherPath)}`;
  const merged = mergeStatusLineSettings(existing, command, REFRESH_INTERVAL);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  process.stdout.write(
    `Your ul is now in the Claude Code status bar.\n  settings: ${settingsPath}\n  command:  ${command}\nRestart Claude Code (or wait a moment) to see it. Re-run /ul-setup or this command anytime to refresh it.\n`,
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`Could not enable the statusline: ${(err as Error).message}\n`);
  process.exit(1);
}
