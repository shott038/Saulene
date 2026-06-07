/**
 * @saulene/plugin — Stop hook CLI entry
 *
 * Claude Code passes a JSON payload on stdin including transcript_path. Reads the
 * session transcript and runs the full perceive → consolidate → persist drift pipeline.
 *
 * Uses ANTHROPIC_API_KEY from the environment (always set in a Claude Code session).
 */

import { readFileSync } from "node:fs";
import { AnthropicLlmClient } from "../hooks/llm.js";
import { stop } from "../hooks/stop.js";

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

const llm = new AnthropicLlmClient();

await stop({
  transcript,
  llm,
  now: Date.now(),
  ...(payload.session_id ? { sessionId: payload.session_id } : {}),
});

process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
