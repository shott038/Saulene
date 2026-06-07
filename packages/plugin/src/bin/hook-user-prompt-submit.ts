/**
 * @saulene/plugin — UserPromptSubmit hook CLI entry
 *
 * Claude Code passes a JSON payload on stdin. Reads the session cache written by
 * SessionStart and returns the rendered voice as additionalContext alongside the
 * user's prompt — the S1 / conversation-channel delivery position.
 *
 * Returns { continue: true } with no additionalContext when dormant.
 */

import { readFileSync } from "node:fs";
import { userPromptSubmit } from "../hooks/user-prompt-submit.js";

const raw = readFileSync(0, "utf8");
const payload = JSON.parse(raw) as { cwd?: string };

const injection = userPromptSubmit({
  cwd: payload.cwd ?? process.cwd(),
  now: Date.now(),
});

if (injection) {
  process.stdout.write(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: injection.text,
      },
    }) + "\n",
  );
} else {
  process.stdout.write(JSON.stringify({ continue: true }) + "\n");
}
