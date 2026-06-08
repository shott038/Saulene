/**
 * @saulene/plugin — skill
 *
 * The `/ul` command: "show my ul" — loads the SAFE snapshot via the shared read path
 * (mcp/snapshot) and formats it as a readable markdown string. Surfaces:
 *
 *   - Who the ul is right now (MBTI, stage, age, sex)
 *   - Public ID and neglect-death countdown
 *   - Qualitative drift summary (no raw numbers)
 *   - Gallery coming-soon teaser + GitHub star CTA
 *
 * VALUABLE fields (aspects, set-points, tension, stubbornness, raw drift numbers)
 * are intentionally absent — those are for the gallery when it ships.
 *
 * Returns `null` when no ul exists yet (not born).
 * This is a pure formatting function — no IO beyond what `snapshot()` does.
 */

import { snapshot } from "../mcp/snapshot.js";
import type { SnapshotOpts, UlSnapshot } from "../mcp/snapshot.js";

export type { UlSnapshot };

export interface UlTextOpts extends SnapshotOpts {
  /** How many recent drift rows to analyze. Default: 10. */
  driftRows?: number;
}

/** GitHub repo URL — for the star CTA in the gallery teaser. */
const GITHUB_URL = "https://github.com/shott038/Saulene";

/**
 * Returns the `/ul` formatted identity snapshot as a markdown string.
 * Returns `null` when no ul exists (not yet born).
 */
export function ulText(opts: UlTextOpts = {}): string | null {
  const snap = snapshot({ ...opts, driftRows: opts.driftRows ?? 10 });
  if (!snap) return null;
  return format(snap);
}

// ── Formatters ────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  childhood: "Childhood",
  adolescence: "Adolescence",
  early_adulthood: "Early adulthood",
  old_adulthood: "Old adulthood",
};

function countdownLine(snap: UlSnapshot): string {
  if (snap.isDead) {
    const overBy = Math.abs(Math.floor(snap.daysUntilDeath));
    return `☠ Neglect-dead — ${overBy}d past the 90-day threshold. Restore via the Saulene token.`;
  }
  const days = Math.floor(snap.daysUntilDeath);
  if (days <= 7) return `⚠ ${days}d until neglect-death. Use the ul to reset the clock.`;
  if (days <= 30) return `${days}d remaining (90-day neglect clock).`;
  return `${days}d until neglect-death.`;
}

function format(snap: UlSnapshot): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `## ul — ${snap.mbti} · ${STAGE_LABELS[snap.stage] ?? snap.stage} · ${Math.round(snap.mp)}mp`,
  );
  lines.push(`sex: ${snap.sex}  ·  ${countdownLine(snap)}`);
  if (snap.publicId) lines.push(`id: ${snap.publicId}`);
  lines.push("");

  // Qualitative drift
  if (snap.qualitativeDrift.length > 0) {
    lines.push("### Recently");
    for (const phrase of snap.qualitativeDrift) {
      lines.push(phrase);
    }
    lines.push("");
  }

  // Gallery coming-soon teaser + star CTA
  lines.push("### A gallery is coming");
  lines.push("If Saulene gets popular enough, a public gallery goes live where you can:");
  lines.push("- customize how your ul looks in your terminal");
  lines.push("- see the oldest ul alive, and the wisest");
  lines.push("- the average age of every ul, the rarest types, the biggest ruptures");
  lines.push("- find your own ul on the shared wall");
  lines.push("");
  lines.push(`⭐ Want it built for real? Star the repo → ${GITHUB_URL}`);

  return lines.join("\n");
}
