/**
 * @saulene/plugin — SessionStart hook CLI entry
 *
 * Claude Code passes a JSON payload on stdin; we call sessionStart() for side effects
 * (gating + render + cache write + lastUsedAt bump) and return { continue: true }.
 * No additionalContext — voice delivery happens via UserPromptSubmit (S1 design).
 */

import { readFileSync } from "node:fs";
import { sessionStart } from "../hooks/session-start.js";

const raw = readFileSync(0, "utf8");
const payload = JSON.parse(raw) as { cwd?: string };

sessionStart({
  cwd: payload.cwd ?? process.cwd(),
  now: Date.now(),
});

process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
