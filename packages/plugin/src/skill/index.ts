/**
 * @saulene/plugin — skill
 *
 * The `/ul` command: "show my ul" — loads the snapshot via the shared read path
 * (mcp/snapshot) and formats it as a readable markdown string. Surfaces:
 *
 *   - Who the ul is right now (MBTI, stage, age, sex/stubbornness)
 *   - The 10 aspects as a bar chart (current value vs innate set point)
 *   - Tension (how close to a breaking point per aspect)
 *   - How it's changed (recent drift from the ledger)
 *   - How close to death (neglect countdown)
 *
 * Returns `null` when no ul exists yet (not born).
 * This is a pure formatting function — no IO beyond what `snapshot()` does.
 */

import { ASPECTS } from "@saulene/core";
import { snapshot } from "../mcp/snapshot.js";
import type { SnapshotOpts, UlSnapshot } from "../mcp/snapshot.js";

export type { UlSnapshot };

export interface UlTextOpts extends SnapshotOpts {
  /** How many recent drift rows to show. Default: 10. */
  driftRows?: number;
}

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

const ASPECT_LABELS: Record<string, string> = {
  openness: "Openness",
  intellect: "Intellect",
  industriousness: "Industriousness",
  orderliness: "Orderliness",
  enthusiasm: "Enthusiasm",
  assertiveness: "Assertiveness",
  compassion: "Compassion",
  politeness: "Politeness",
  withdrawal: "Withdrawal",
  volatility: "Volatility",
};

const STAGE_LABELS: Record<string, string> = {
  childhood: "Childhood",
  adolescence: "Adolescence",
  early_adulthood: "Early adulthood",
  old_adulthood: "Old adulthood",
};

/** Render a 0-100 value as a 20-char bar with the set-point marker. */
function bar(value: number, setPoint: number): string {
  const width = 20;
  const filled = Math.round((value / 100) * width);
  const spPos = Math.round((setPoint / 100) * width);
  const chars = Array.from<string>({ length: width }).fill("░");
  for (let i = 0; i < filled; i++) chars[i] = "█";
  // Mark the set point with ◆ if not already in the filled region.
  if (spPos < width) {
    chars[spPos] = filled > spPos ? "◆" : "◇";
  }
  return chars.join("");
}

/** Format tension as a short label. */
function tensionLabel(t: number): string {
  if (t < 0.2) return "";
  if (t < 0.5) return " ⚡low";
  if (t < 1.0) return " ⚡mid";
  return " ⚡HIGH";
}

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
  lines.push(`## ul — ${snap.mbti} · ${STAGE_LABELS[snap.stage]} · ${Math.round(snap.mp)}mp`);
  lines.push(
    `sex: ${snap.sex}  stubbornness: ${Math.round(snap.stubbornness * 100)}/100  ${countdownLine(snap)}`,
  );
  lines.push("");

  // Aspects table
  lines.push("### Aspects  (█ current  ◆ innate setpoint  ⚡ tension)");
  lines.push("");

  const domainGroups: Array<[string, string[]]> = [
    ["Openness", ["openness", "intellect"]],
    ["Conscientiousness", ["industriousness", "orderliness"]],
    ["Extraversion", ["enthusiasm", "assertiveness"]],
    ["Agreeableness", ["compassion", "politeness"]],
    ["Neuroticism", ["withdrawal", "volatility"]],
  ];

  for (const [domain, aspects] of domainGroups) {
    lines.push(`**${domain}**`);
    for (const a of aspects) {
      const v = snap.aspects[a as keyof typeof snap.aspects] ?? 0;
      const s = snap.setPoints[a as keyof typeof snap.setPoints] ?? 0;
      const t = snap.tension[a as keyof typeof snap.tension] ?? 0;
      const label = (ASPECT_LABELS[a] ?? a).padEnd(16);
      lines.push(`  ${label} ${bar(v, s)} ${String(v).padStart(3)}/100${tensionLabel(t)}`);
    }
    lines.push("");
  }

  // Recent drift
  if (snap.recentDrift.length > 0) {
    lines.push("### Recent drift (last sessions)");
    lines.push("");
    const seen = new Map<string, { practice: number; fit: number; count: number }>();
    for (const row of snap.recentDrift) {
      const key = row.aspect;
      const existing = seen.get(key);
      if (existing) {
        existing.practice += row.practice;
        existing.fit += row.fit;
        existing.count += 1;
      } else {
        seen.set(key, { practice: row.practice, fit: row.fit, count: 1 });
      }
    }
    const sorted = [...seen.entries()].sort((a, b) => b[1].practice - a[1].practice);
    for (const [aspect, agg] of sorted.slice(0, 6)) {
      const avgP = (agg.practice / agg.count).toFixed(1);
      const avgF = agg.fit / agg.count;
      const fitStr = avgF >= 0.5 ? `+${avgF.toFixed(1)}` : avgF.toFixed(1);
      lines.push(
        `  ${(ASPECT_LABELS[aspect] ?? aspect).padEnd(16)} practice ${avgP}/3  fit ${fitStr}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
