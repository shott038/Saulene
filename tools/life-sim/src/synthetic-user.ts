/**
 * @saulene/life-sim — SyntheticUser
 *
 * Generates the user's side of a multi-turn conversation.
 * Persona-driven: each persona has a distinct voice and engagement style.
 * Fully DI — the LlmClient is injected, so tests can use a fake.
 */

import type { LlmClient } from "@saulene/perception";
import type { Persona, WorkType } from "./buckets.js";
import { PERSONA_DESCRIPTIONS, WORK_TYPE_DESCRIPTIONS } from "./buckets.js";

export interface SyntheticUserOpts {
  persona: Persona;
  workType: WorkType;
  /** Optional arc: persona intensity shifts across session index (0–1 scalar applied at turn N). */
  arc?: (sessionIndex: number) => number;
}

export interface TurnContext {
  turnIndex: number;
  totalTurns: number;
  sessionIndex: number;
  history: Array<{ role: "user" | "assistant"; text: string }>;
}

/** Generates the user side of a conversation turn by calling the injected LlmClient. */
export class SyntheticUser {
  private readonly persona: Persona;
  private readonly workType: WorkType;
  private readonly arc: ((sessionIndex: number) => number) | undefined;
  private readonly llm: LlmClient;

  constructor(opts: SyntheticUserOpts, llm: LlmClient) {
    this.persona = opts.persona;
    this.workType = opts.workType;
    this.arc = opts.arc;
    this.llm = llm;
  }

  async turn(ctx: TurnContext): Promise<string> {
    const personaDesc = PERSONA_DESCRIPTIONS[this.persona];
    const workDesc = WORK_TYPE_DESCRIPTIONS[this.workType];
    const historyBlock =
      ctx.history.length === 0
        ? "(no prior turns — this is the opening message)"
        : ctx.history
            .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.text}`)
            .join("\n");

    const isOpening = ctx.turnIndex === 0;
    const isClosing = ctx.turnIndex === ctx.totalTurns - 1;
    const turnHint = isOpening
      ? "This is your OPENING message — introduce what you need."
      : isClosing
        ? "This is your FINAL message — wrap up, thank the assistant, or ask a closing question."
        : "Continue the conversation naturally based on what the assistant said.";

    const prompt = `${personaDesc}

Work context: ${workDesc}

Prior conversation:
${historyBlock}

${turnHint}

Generate your next message as the user. Stay in character. Output only the message text (no quotes, no prefix like "User:").`;

    return this.llm.complete(prompt);
  }
}
