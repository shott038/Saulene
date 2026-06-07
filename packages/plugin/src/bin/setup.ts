/**
 * @saulene/plugin — first-run setup CLI entry
 *
 * Interactive terminal program that drives the first-run wizard. Run directly in the terminal
 * (not via a Claude Code print-style skill — this needs real stdin interactivity):
 *
 *   node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js
 *
 * Wires `runWizard` with:
 *   - Node `readline` for the reality-warning ack + level pick
 *   - Real `Date.now()` / `randomBytes(32)` entropy / `defaultRoot()` storage root
 *   - Birth animation playing on stdout during the watch-only birth beat
 */

import { createInterface } from "node:readline";
import { defaultRoot } from "@saulene/storage";
import { runWizard } from "../setup/index.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function readlineOnce(): Promise<string> {
  return new Promise((resolve) => {
    rl.once("line", (line) => resolve(line.trim()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
