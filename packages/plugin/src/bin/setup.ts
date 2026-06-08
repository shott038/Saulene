/**
 * @saulene/plugin — first-run setup CLI entry
 *
 * Three modes — selected automatically:
 *
 * 1. FLAGS present (e.g. --yes --scope global --no-anim):
 *    Non-interactive path — calls runSetup() with no readline. Safe to run from
 *    Claude Code's `!` runner (no TTY needed). Claude Code's /ul-setup skill
 *    collects answers in chat then invokes this path.
 *
 * 2. No flags + stdin.isTTY:
 *    Interactive path — existing runWizard() with readline. Works in a real terminal.
 *
 * 3. No flags + NOT a TTY:
 *    Helpful message + clean exit. Never hangs on an unsettled await.
 *
 * Flags (non-interactive mode):
 *   --yes / -y          Acknowledge the reality warning (required).
 *   --scope global|dir  Where the ul lives. Default: global.
 *   --dir <path>        Absolute path; required when --scope dir.
 *   --reporter on|off   Gallery reporting. Default: on.
 *   --mode dark|light   Terminal color mode. Default: dark.
 *   --no-anim           Skip animated birth; print static keyframes instead.
 *                       Auto-enabled when stdout is not a TTY.
 */

import { createInterface } from "node:readline";
import { defaultRoot } from "@saulene/storage";
import { runSetup, runWizard } from "../setup/index.js";

// ── Argv parsing ──────────────────────────────────────────────────────────────

interface ParsedFlags {
  acknowledged: boolean;
  scope: "global" | "dir";
  dir: string | undefined;
  reporterEnabled: boolean | undefined;
  mode: "dark" | "light";
  noAnim: boolean;
}

function parseFlags(argv: string[]): ParsedFlags {
  let acknowledged = false;
  let scope: "global" | "dir" = "global";
  let dir: string | undefined;
  let reporterEnabled: boolean | undefined;
  let mode: "dark" | "light" = "dark";
  let noAnim = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--yes":
      case "-y":
        acknowledged = true;
        break;
      case "--scope": {
        const val = argv[++i];
        if (val === "global" || val === "dir") scope = val;
        break;
      }
      case "--dir":
        dir = argv[++i];
        break;
      case "--reporter": {
        const val = argv[++i];
        if (val === "off") reporterEnabled = false;
        else if (val === "on") reporterEnabled = true;
        break;
      }
      case "--mode": {
        const val = argv[++i];
        if (val === "dark" || val === "light") mode = val;
        break;
      }
      case "--no-anim":
        noAnim = true;
        break;
    }
  }

  return { acknowledged, scope, dir, reporterEnabled, mode, noAnim };
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlags = args.length > 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (hasFlags) {
  // Mode 1: non-interactive (flags provided)
  const flags = parseFlags(args);
  await runSetup({
    acknowledged: flags.acknowledged,
    scope: flags.scope,
    ...(flags.dir !== undefined ? { dir: flags.dir } : {}),
    ...(flags.reporterEnabled !== undefined ? { reporterEnabled: flags.reporterEnabled } : {}),
    mode: flags.mode,
    noAnim: flags.noAnim || !process.stdout.isTTY,
    write: (s) => process.stdout.write(s),
    sleep,
    storageRoot: defaultRoot(),
    now: Date.now(),
  });
} else if (process.stdin.isTTY) {
  // Mode 2: interactive wizard (real terminal)
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  function readlineOnce(): Promise<string> {
    return new Promise((resolve) => {
      rl.once("line", (line) => resolve(line.trim()));
    });
  }
  await runWizard({
    write: (s) => process.stdout.write(s),
    readline: readlineOnce,
    sleep,
    storageRoot: defaultRoot(),
    now: Date.now(),
    mode: "dark",
  });
  rl.close();
} else {
  // Mode 3: no flags, no TTY — print helpful message and exit cleanly (never hang)
  process.stdout.write(
    "\nSetup needs either flags or an interactive terminal.\n" +
      "  In Claude Code:  run /ul-setup (the skill guides you through it)\n" +
      "  In a terminal:   node setup.js\n" +
      "  With flags:      node setup.js --yes --scope global --no-anim\n\n",
  );
  process.exit(0);
}
