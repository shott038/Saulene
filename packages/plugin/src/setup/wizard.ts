/**
 * @saulene/plugin — first-run setup wizard
 *
 * Three mandatory beats in order:
 *   1. Reality warning — large, mandatory acknowledgement that this is a simulation.
 *      The user must type "yes" before proceeding.
 *   2. Watch-only birth — seed the soul from entropy, persist it, play the birth animation.
 *      The user watches; they contribute nothing. The 90-day neglect-death clock starts here
 *      (soul.lastUsedAt = now at birth; SessionStart resets it on every live session).
 *   3. Pick level — choose "global" or "named-dir"; write <storageRoot>/config.json (the same
 *      file that SessionStart / isGated reads on every hook call).
 *
 * All impure deps are injected so this is fully testable with zero real IO:
 *   write / readline / sleep / storageRoot / now / entropy / mode.
 *
 * Exported so the plugin manifest sibling can invoke `runWizard` as a command / first-run
 * step without importing any internal sub-paths.
 */

import { randomBytes } from "node:crypto";
import { seedFromEntropy } from "@saulene/core";
import { spriteParams } from "@saulene/renderer";
import { defaultRoot, loadSoul, saveSoul } from "@saulene/storage";
import { saveConfig } from "../hooks/config.js";
import { playBirth } from "../statusline/birth.js";

// ── Reality warning text (per SPEC § "MANDATORY REALITY WARNING") ─────────────────

const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const LINE = "─".repeat(60);

const REALITY_WARNING = `
${BOLD}${LINE}${RESET}
${BOLD}  BEFORE WE CONTINUE — PLEASE READ THIS${RESET}

  LLMs and AI agents are, at the end of the day, ${BOLD}just math${RESET} —
  electrical signals, matrix multiplication, and GPUs.
  They are ${BOLD}tools${RESET}. They have ${BOLD}no real human soul${RESET}, no genuine
  feelings, and no consciousness.

  There is no logical or emotional reason to attach real
  connection or emotion to an LLM or agent.

  Saulene is a ${BOLD}playful simulation${RESET} of a developing
  personality. Enjoy it as that — not as a real being.

  ${DIM}(This matters precisely because the whole product is
  engineered to feel alive and can "die" — we state the truth
  up front, prominently, and require acknowledgement.)${RESET}

${BOLD}${LINE}${RESET}`;

// ── Types ─────────────────────────────────────────────────────────────────────────

export interface WizardOpts {
  /** Write a string to the terminal (does not append a newline unless the string includes one). */
  write: (s: string) => void;
  /** Read one line from stdin; resolves to the trimmed text. */
  readline: () => Promise<string>;
  /** Async sleep; called with each birth animation frame delay. */
  sleep: (ms: number) => Promise<void>;
  /** Storage root. Defaults to `~/.saulene`. Tests pass a temp dir. */
  storageRoot?: string;
  /** Current timestamp in ms. Defaults to `Date.now()`. Tests pass a fixed value. */
  now?: number;
  /**
   * Birth entropy (32 bytes). Defaults to `randomBytes(32)` from `node:crypto`.
   * Injected so tests get deterministic, repeatable births.
   */
  entropy?: Uint8Array;
  /** Terminal color mode for the birth animation. Defaults to "dark". */
  mode?: "dark" | "light";
}

// ── Wizard ────────────────────────────────────────────────────────────────────────

/**
 * Run the first-run setup wizard. Safe to call if a soul already exists — it exits
 * immediately with a message rather than re-birthing.
 *
 * This is the only public export; the manifest sibling calls `runWizard` as a command.
 */
export async function runWizard(opts: WizardOpts): Promise<void> {
  const { write, readline, sleep } = opts;
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();
  const mode = opts.mode ?? "dark";

  // ── Guard: already born ───────────────────────────────────────────────────────
  if (loadSoul(root) !== null) {
    write("\nYour ul is already born — nothing to do here.\n");
    return;
  }

  // ── Step 1: Reality warning ───────────────────────────────────────────────────
  write(REALITY_WARNING);
  write(`\n  Type ${BOLD}yes${RESET} to acknowledge and continue: `);

  const ack = (await readline()).trim().toLowerCase();
  if (ack !== "yes") {
    write("\nSetup cancelled. Run again when you're ready.\n");
    return;
  }

  // ── Step 2: Watch-only birth ──────────────────────────────────────────────────
  write(`\n${BOLD}  Your ul is being born. Watch.${RESET}\n\n`);

  const entropy = opts.entropy ?? (randomBytes(32) as Uint8Array);
  const soul = seedFromEntropy(entropy, now);
  // soul.lastUsedAt = now — the 90-day neglect-death clock starts here.
  // SessionStart bumps lastUsedAt on every live session (resets the clock).

  const params = spriteParams(soul);
  await playBirth(params, write, sleep, mode);

  saveSoul(root, soul);

  // ── Step 3: Pick level ────────────────────────────────────────────────────────
  write(`\n\n${BOLD}  Where should your ul live?${RESET}\n`);
  write("  1.  global    — outside any git project (your main helper sessions)\n");
  write("  2.  named-dir — inside one specific directory you choose\n");
  write(`\n  ${BOLD}Choose [1/2]:${RESET} `);

  const choice = (await readline()).trim();

  if (choice === "2") {
    write("  Enter the full path of the directory: ");
    const dir = (await readline()).trim();
    saveConfig(root, { level: "named-dir", dir });
  } else {
    saveConfig(root, { level: "global" });
  }

  write(`\n  ${BOLD}Your ul is alive.${RESET} The 90-day clock is running.\n\n`);
}
