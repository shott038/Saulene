/**
 * @saulene/simulator — narration
 *
 * Turns a `Trajectory` into the human-readable "why" the SPEC's acceptance test calls for:
 * born X; this life did Y; here is the mechanism that produced the adult it became. The
 * narration is part of the proof — it reads the trajectory, it never re-derives engine math.
 */

import { type Aspect, type AspectVector, type Soul, projectMbti } from "@saulene/core";
import type { Trajectory } from "./lifetime.js";

const f2 = (x: number): string => x.toFixed(2);

/** Coarse position on the stubborn↔clay spectrum, for prose. */
function temperament(stubbornness: number): string {
  if (stubbornness < 0.34) return "clay";
  if (stubbornness < 0.67) return "mixed";
  return "stubborn";
}

/** The N aspects this ul sits highest on at birth, descending — its visible nature. */
function dominant(v: AspectVector, n: number): string {
  return ASPECTS_BY_VALUE(v)
    .slice(0, n)
    .map(([a, val]) => `${a} ${f2(val)}`)
    .join(", ");
}

function ASPECTS_BY_VALUE(v: AspectVector): [Aspect, number][] {
  return (Object.entries(v) as [Aspect, number][]).sort((p, q) => q[1] - p[1]);
}

/** One-line birth descriptor: sex, MBTI, temperament, the two traits it leans into. */
export function describeBirth(soul: Soul): string {
  return (
    `born ${soul.sex}, ${projectMbti(soul.v)}, ${temperament(soul.stubbornness)} ` +
    `(stubbornness ${f2(soul.stubbornness)}); leans into ${dominant(soul.v, 2)}`
  );
}

/**
 * Narrate one scripted life: birth → what the life did → the resulting adult, foregrounding the
 * `contested` aspects (the ones the two lives differ on) and any breaking points.
 */
export function narrate(
  traj: Trajectory,
  opts: { title: string; contested: readonly Aspect[] },
): string {
  const { birth, final, snapshots, breaks } = traj;
  const lines: string[] = [];
  lines.push(`── ${opts.title} ──`);
  lines.push(`  ${describeBirth(birth)}`);

  const lastStage = snapshots.at(-1)?.stage ?? "childhood";

  // Breaking points: count, which aspects, where they started.
  if (breaks.length === 0) {
    lines.push("  no breaking points — the life never ruptured.");
  } else {
    const byAspect = new Map<Aspect, number>();
    for (const b of breaks) byAspect.set(b.aspect, (byAspect.get(b.aspect) ?? 0) + 1);
    const tally = [...byAspect.entries()].map(([a, c]) => `${a}×${c}`).join(", ");
    const first = breaks[0] as Trajectory["breaks"][number];
    lines.push(`  ${breaks.length} breaking point(s) [${tally}], first in ${first.stage}.`);
  }

  // The contested aspects: how nature (s) and disposition (v) moved over the life.
  for (const a of opts.contested) {
    const v0 = birth.v[a];
    const vN = final.v[a];
    const s0 = birth.s[a];
    const sN = final.s[a];
    const moved = sN !== s0 ? ` ; set-point migrated ${f2(s0)} → ${f2(sN)}` : " ; set-point held";
    lines.push(`  ${a}: v ${f2(v0)} → ${f2(vN)}${moved}`);
  }

  // The headline: did the readable identity change?
  const birthMbti = projectMbti(birth.v);
  const finalMbti = projectMbti(final.v);
  const verdict =
    birthMbti === finalMbti
      ? `crystallized as ${finalMbti} (${lastStage}) — reinforced along its nature.`
      : `${birthMbti} → ${finalMbti} (${lastStage}) — the lived life flipped its readout.`;
  lines.push(`  ${verdict}`);

  return lines.join("\n");
}
