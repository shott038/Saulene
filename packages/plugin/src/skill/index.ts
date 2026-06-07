/**
 * @saulene/plugin — skill
 *
 * The `/ul` command: "show my ul" — loads the SAFE snapshot via the shared read path
 * (mcp/snapshot) and formats it as a readable markdown string. Surfaces:
 *
 *   - Who the ul is right now (MBTI, stage, age, sex)
 *   - Public ID and neglect-death countdown
 *   - Qualitative drift summary (no raw numbers)
 *   - Gallery upsell for the full breakdown
 *
 * VALUABLE fields (aspects, set-points, tension, stubbornness, raw drift numbers)
 * are intentionally absent — see the gallery for those.
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

/** Gallery base URL — where the full breakdown lives (paid surface). */
const GALLERY_URL = "https://saulene.app";

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

  // Gallery upsell
  const galleryLink = snap.publicId ? `${GALLERY_URL}/ul/${snap.publicId}` : GALLERY_URL;
  lines.push(`See your full breakdown → ${galleryLink}`);

  return lines.join("\n");
}
