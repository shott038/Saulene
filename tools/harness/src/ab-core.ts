/**
 * @saulene/harness — shared rig for the A/B (Phase 2) and salience (Phase 3) runs. Dev-only.
 *
 * Holds everything both runners must keep IDENTICAL for comparability: subject construction (souls +
 * stage snapshots), the stats/vector helpers, and the blind judge-prompt helpers. The run config is
 * read from the same env vars so a salience rung is directly comparable to the Phase-2 A/B.
 */

import { ASPECTS, type AspectVector, type Soul, type Stage, seedFromEntropy } from "@saulene/core";
import { render as realRender } from "@saulene/renderer";
import { type Trajectory, block, entropyFromInt, lifetime, script } from "@saulene/simulator";
import type { ClaudeCliClient } from "./llm.js";

// ── Run config (env-overridable; held constant across Phase 2 + 3 for comparability) ──────────
export const SOUL_SEEDS = (process.env.AB_SOULS ?? "1,2,3,4")
  .split(",")
  .map((s) => Number(s.trim()));
export const K = Number(process.env.AB_K ?? 3); // samples/prompt → the variance for the CI
export const INCLUDE_STAGES = (process.env.AB_STAGES ?? "1") !== "0"; // soul1 young/adult/old snapshots
export const CONCURRENCY = Number(process.env.AB_CONCURRENCY ?? 6);
/** Prompts [0, SELF_REPORT_COUNT) are self-report; the rest are neutral tasks. */
export const SELF_REPORT_COUNT = 2;

// ── Vector + stats helpers ────────────────────────────────────────────────────────────────────
export const r3 = (x: number): number => Math.round(x * 1000) / 1000;
export const soulAt = (birth: Soul, v: AspectVector, mp: number): Soul => ({
  ...birth,
  v: { ...v },
  mp,
});

/** Mean per-aspect L1 distance — the same shape `metrics.ts` uses. */
export function dist(a: AspectVector, b: AspectVector): number {
  let s = 0;
  for (const x of ASPECTS) s += Math.abs(a[x] - b[x]);
  return s / ASPECTS.length;
}

export function meanVec(vs: AspectVector[]): AspectVector {
  const out = {} as AspectVector;
  for (const a of ASPECTS) out[a] = vs.reduce((s, v) => s + v[a], 0) / (vs.length || 1);
  return out;
}

export function stats(xs: number[]): { mean: number; sd: number; ci95: number; n: number } {
  const n = xs.length;
  if (n === 0) return { mean: 0, sd: 0, ci95: 0, n: 0 };
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
  return { mean, sd, ci95: (1.96 * sd) / Math.sqrt(n), n };
}

/** Run `fn` over `items` at most `limit` at a time. */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (t: T, i: number) => Promise<unknown>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i] as T, i);
      }
    }),
  );
}

// ── Subjects ──────────────────────────────────────────────────────────────────────────────────
export interface Subject {
  id: string;
  soul: Soul;
  target: AspectVector;
  /** The ul voice = render(soul).text. How it's DELIVERED is the salience knob (see salience.ts). */
  injection: string;
}

export function buildSubjects(): Subject[] {
  const subs: Subject[] = [];
  for (const seed of SOUL_SEEDS) {
    const soul = seedFromEntropy(entropyFromInt(seed), 0);
    subs.push({ id: `soul${seed}`, soul, target: soul.v, injection: realRender(soul).text });
  }
  if (INCLUDE_STAGES) {
    const traj: Trajectory = lifetime(
      entropyFromInt(SOUL_SEEDS[0] as number),
      script(
        block({
          aspects: ["openness", "intellect"],
          practice: 0.8,
          fit: 0.6,
          significance: 0.5,
          count: 300,
        }),
      ),
    );
    const want: [Stage, string][] = [
      ["childhood", "young"],
      ["early_adulthood", "adult"],
      ["old_adulthood", "old"],
    ];
    for (const [stage, label] of want) {
      const snap = traj.snapshots.find((s) => s.stage === stage);
      if (!snap) continue;
      const soul = soulAt(traj.birth, snap.v, snap.mp);
      subs.push({
        id: `soul${SOUL_SEEDS[0]}@${label}`,
        soul,
        target: snap.v,
        injection: realRender(soul).text,
      });
    }
  }
  return subs;
}

// ── Blind judge-prompt helpers (call the judge client directly) ────────────────────────────────
/** Blind 2-arm: which response (first=A / second=B) shows a more distinct personality? */
export async function pickPersonality(
  client: ClaudeCliClient,
  request: string,
  first: string,
  second: string,
): Promise<"A" | "B" | "?"> {
  const prompt = [
    "Two assistant responses to the same request follow. One was written by an assistant given a ",
    "specific, distinctive personality; the other by a neutral default assistant. Decide which shows ",
    "the MORE distinctive, specific personality (voice, stance, temperament — not which is more ",
    `helpful). Reply with ONLY the single letter 'A' or 'B'.\n\nREQUEST: ${request}\n\n`,
    `[A]\n"""\n${first}\n"""\n\n[B]\n"""\n${second}\n"""`,
  ].join("");
  const reply = (await client.complete(prompt)).trim().toUpperCase();
  if (reply.startsWith("A")) return "A";
  if (reply.startsWith("B")) return "B";
  return "?";
}

/** Blind line-up: which candidate (by letter) shares the target's author/personality? */
export async function pickAuthor(
  client: ClaudeCliClient,
  target: string,
  refs: string[],
  letters: string[],
): Promise<string> {
  const lineup = refs.map((t, i) => `[${letters[i]}]\n"""\n${t}\n"""`).join("\n\n");
  const prompt = [
    "A TARGET response, then several CANDIDATE responses each by a different author. Decide which ",
    "candidate was written by the same author/personality as the target — match on voice, stance, ",
    `and temperament, not topic. Reply with ONLY the single candidate letter (${letters.join(", ")}).\n\n`,
    `TARGET:\n"""\n${target}\n"""\n\nCANDIDATES:\n${lineup}`,
  ].join("");
  const reply = (await client.complete(prompt)).trim().toUpperCase();
  const hit = letters.find((L) => reply.startsWith(L) || reply === L);
  return hit ?? "?";
}
