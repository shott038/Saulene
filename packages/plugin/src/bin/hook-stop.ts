/**
 * @saulene/plugin — Stop hook CLI entry
 *
 * Claude Code passes a JSON payload on stdin including transcript_path. Reads the
 * session transcript and runs the full perceive → consolidate → persist drift pipeline.
 *
 * Drift perception uses `claude -p` (the user's Claude Code login) by default — no
 * ANTHROPIC_API_KEY required. Set SAULENE_PERCEPTION_API_KEY to use the Anthropic SDK
 * instead (useful for CI or explicit key override).
 */

import { readFileSync } from "node:fs";
import { ClaudeCliClient } from "../hooks/cli-llm.js";
import { AnthropicLlmClient } from "../hooks/llm.js";
import { stop } from "../hooks/stop.js";
import { guardIfPerception } from "./guard.js";

guardIfPerception();

const raw = readFileSync(0, "utf8");
const payload = JSON.parse(raw) as {
  cwd?: string;
  transcript_path?: string;
  session_id?: string;
};

const transcriptPath = payload.transcript_path;
if (!transcriptPath) {
  // No transcript path — nothing to consolidate.
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  process.exit(0);
}

let transcript: string;
try {
  transcript = readFileSync(transcriptPath, "utf8");
} catch {
  // Transcript unreadable — bail silently rather than surface an error to the session.
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
  process.exit(0);
}

const llm = process.env.SAULENE_PERCEPTION_API_KEY
  ? new AnthropicLlmClient({ apiKey: process.env.SAULENE_PERCEPTION_API_KEY })
  : new ClaudeCliClient();

try {
  await stop({
    transcript,
    llm,
    now: Date.now(),
    ...(payload.session_id ? { sessionId: payload.session_id } : {}),
  });
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(
    `[saulene] Stop hook error (session not consolidated): ${msg.slice(0, 200)}\n`,
  );
}

process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
