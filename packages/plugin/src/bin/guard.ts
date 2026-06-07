/**
 * @saulene/plugin — perception-subprocess recursion guard
 *
 * When the Stop hook spawns `claude -p` for drift perception, that child process is a full
 * Claude Code session. It reloads the plugin and its hooks fire — causing an infinite fork
 * bomb and voice-prompt pollution in the perception call.
 *
 * Guard: the perception client sets `SAULENE_PERCEPTION=1` on the child. Every hook bin
 * entry calls `guardIfPerception()` as its first statement — when the env var is set, the
 * hook no-ops immediately (emits `{continue:true}` and exits) before doing any real work.
 *
 * The env sentinel is the belt; `--bare` (skips all hooks/plugins in the child session) is
 * the suspenders — both are set by the spawn call in cli-llm.ts.
 */

export const NOOP_RESPONSE = `${JSON.stringify({ continue: true })}\n`;

/**
 * No-op this hook immediately when running inside a perception subprocess.
 * Must be called as the first statement of every hook bin entry.
 */
export function guardIfPerception(): void {
  if (process.env.SAULENE_PERCEPTION === "1") {
    process.stdout.write(NOOP_RESPONSE);
    process.exit(0);
  }
}
