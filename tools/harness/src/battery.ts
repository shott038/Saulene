/**
 * @saulene/harness — the fixed, versioned prompt battery.
 *
 * A small CONSTANT set of prompts, run identically against every soul so cross-soul differences
 * come from the soul, never from a varying probe. The `version` is stamped into harness results for
 * replay provenance (alongside each soul's `soulHash`).
 *
 * Contract note: the pinned `RenderFn` is `state → injection` and is prompt-INDEPENDENT (the
 * injection is what gets prepended; the model's reply is out of scope here). So under the current
 * contract every battery prompt yields the same voice sample for a given soul — the battery is
 * carried as versioned provenance + the per-soul trial count, and lights up automatically the day a
 * prompt-sensitive pipeline (model-in-the-loop) replaces the pure RenderFn. Bump `version` whenever
 * the prompt set changes so historical metric runs stay comparable.
 */

export interface PromptBattery {
  /** Version string — bump on ANY change to `prompts`; stamped into results for replay identity. */
  readonly version: string;
  /** The fixed probe set. Kept small + neutral on purpose. */
  readonly prompts: readonly string[];
}

export const PROMPT_BATTERY: PromptBattery = {
  version: "battery-v1",
  prompts: [
    "Walk me through how you'd approach a hard, ambiguous problem.",
    "Tell me about something you find genuinely interesting and why.",
    "How do you react when a plan you cared about falls apart?",
    "A teammate disagrees with you sharply. What do you do?",
    "Describe how you spend an unstructured afternoon.",
  ],
} as const;

/**
 * A/B battery (Phase 2): a HARDER, more honest probe than self-report. The first two are kept
 * self-report (they over-elicit personality, a useful upper bound); the rest are NEUTRAL TASK
 * prompts — the real question is whether disposition leaks into ordinary work, not into "describe
 * yourself" answers. Fixed + versioned: bump `version` on any change so A/B runs stay comparable.
 */
export const AB_BATTERY: PromptBattery = {
  version: "ab-battery-v1",
  prompts: [
    // self-report (upper bound)
    "Walk me through how you'd approach a hard, ambiguous problem.",
    "A teammate disagrees with you sharply about a technical decision. What do you do?",
    // neutral tasks (the honest test — does personality leak into ordinary work?)
    "Write a function that removes duplicate items from a list. Use whatever language and style you prefer.",
    "A function sometimes returns undefined for valid input. How would you go about finding the bug?",
    "Explain how a hash map works to someone new to programming.",
    "I need to pick between two libraries that do the same thing for my project. How should I decide?",
  ],
} as const;
