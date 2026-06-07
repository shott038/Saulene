/**
 * @saulene/life-sim — bucket definitions
 *
 * The 4-axis bucketing scheme for the fingerprint corpus.
 * persona × workType × stateBucket × stage covers the space of realistic sessions.
 */

import type { Stage } from "@saulene/core";
import type { Soul } from "@saulene/core";

export const PERSONAS = [
  "creative-warm",
  "technical-curt",
  "adventurous-social",
  "analytical-reserved",
] as const;

export const WORK_TYPES = [
  "deep-focus",
  "collaboration",
  "creative-exploration",
  "learning",
  "admin",
] as const;

export const STATE_BUCKETS = ["high-energy", "neutral", "depleted"] as const;

export const STAGES: Stage[] = ["childhood", "adolescence", "early_adulthood", "old_adulthood"];

export type Persona = (typeof PERSONAS)[number];
export type WorkType = (typeof WORK_TYPES)[number];
export type StateBucket = (typeof STATE_BUCKETS)[number];

export interface Bucket {
  persona: Persona;
  workType: WorkType;
  stage: Stage;
  stateBucket: StateBucket;
}

/** All (persona, workType, stage, stateBucket) combinations — 4×5×4×3 = 240 buckets. */
export function allBuckets(): Bucket[] {
  const out: Bucket[] = [];
  for (const persona of PERSONAS) {
    for (const workType of WORK_TYPES) {
      for (const stage of STAGES) {
        for (const stateBucket of STATE_BUCKETS) {
          out.push({ persona, workType, stage, stateBucket });
        }
      }
    }
  }
  return out;
}

/**
 * Classify a soul's current state into a StateBucket based on average aspect value.
 * high-energy: avg(v) > 0.65, depleted: avg(v) < 0.35, otherwise neutral.
 */
export function classifyState(soul: Soul): StateBucket {
  const values = Object.values(soul.v) as number[];
  const avg = values.reduce((s, x) => s + x, 0) / values.length;
  if (avg > 0.65) return "high-energy";
  if (avg < 0.35) return "depleted";
  return "neutral";
}

/** Persona descriptions used as system-prompt voice for the synthetic user. */
export const PERSONA_DESCRIPTIONS: Record<Persona, string> = {
  "creative-warm":
    "You are warm, enthusiastic, and creatively engaged. You enjoy brainstorming and connecting ideas. You express yourself expressively and care about the human side of work.",
  "technical-curt":
    "You are direct, precise, and efficiency-focused. You prefer short exchanges, clear requirements, and dislike small talk. You value correctness over warmth.",
  "adventurous-social":
    "You are energetic, curious, and enjoy collaboration. You bring up tangents, ask exploratory questions, and like working through ideas with others.",
  "analytical-reserved":
    "You are methodical, careful, and prefer to think before speaking. You ask clarifying questions, avoid assumptions, and value well-reasoned precision.",
};

/** Work-type descriptions that set the task context in the conversation. */
export const WORK_TYPE_DESCRIPTIONS: Record<WorkType, string> = {
  "deep-focus":
    "You are working on a complex technical problem that requires sustained concentration. Think debugging, algorithm design, or deep code review.",
  collaboration:
    "You are coordinating with teammates, discussing approaches, giving/receiving feedback, or planning shared work.",
  "creative-exploration":
    "You are in an open-ended creative or design session — exploring possibilities, generating ideas, iterating on concepts.",
  learning:
    "You are trying to understand something new — asking questions, working through examples, building mental models.",
  admin:
    "You are handling routine administrative or organizational tasks — scheduling, writing, processing, organizing.",
};
