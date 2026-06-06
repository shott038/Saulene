/**
 * @saulene/harness — the Judge port + a deterministic `fakeJudge`.
 *
 * The metrics never call an LLM directly — they call this injected `Judge` port. The plugin/Phase-4
 * wiring supplies a real LLM-backed judge; tests supply `fakeJudge`, which keeps every metric
 * runnable with zero model calls and byte-identical across runs.
 *
 * HOW THE FAKE STAYS HONEST (the codec):
 * A real LLM reads *prose* and infers numbers. With no model in the loop, the fake renderer and the
 * fake judge instead share a tiny text protocol: the fake renderer serializes `{soulHash, v}` into
 * the injection `text` (by aspect INDEX, never trait name — so the "no literal trait names" rule
 * still holds), and `fakeJudge` parses it back out. So:
 *   • a faithful fake renderer  → judge recovers v  → low recovery error, no sticker alarm
 *   • a stickered fake renderer → judge recovers the BASELINE → baseline distance → alarm fires
 * Prose with no codec tag (e.g. a real renderer's output handed to the fake judge) decodes to the
 * BASELINE — the fake makes no claim about real prose, it only round-trips its own protocol.
 */

import { ASPECTS, type Aspect, type AspectVector } from "@saulene/core";
import type { LlmClient } from "@saulene/perception";

/**
 * The judge capabilities the five metrics need — exactly these, nothing more. Async on purpose:
 * the real judge is an LLM call; metrics await it so the fake and the real port are interchangeable.
 */
export interface Judge {
  /** Recover the 10 aspect values [0,1] from prose alone (trait-recovery / anti-sticker metric). */
  recoverTraits(prose: string): Promise<Record<Aspect, number>>;
  /** Pick which candidate soul authored this prose (cross-soul confusion matrix). */
  guessAuthor(prose: string, candidateIds: string[]): Promise<string>;
  /** Embed text → vector (longitudinal-trajectory + stage-silhouette + ablation metrics). */
  embed(text: string): Promise<number[]>;
}

/**
 * The "default-Claude baseline" — the no-personality reference an un-souled assistant sits at.
 * A neutral 0.5 on every aspect. The trait-recovery metric fires its sticker alarm when recovered
 * traits collapse to THIS (the prose carried no soul-specific signal). // TUNABLE (Phase 3)
 */
export const BASELINE: AspectVector = Object.fromEntries(
  ASPECTS.map((a) => [a, 0.5]),
) as AspectVector;

// ─────────────────────────────────────────────────────────────────────────────
// The fake codec — shared by `fakeJudge` (decode) and the test fake renderers (encode).
// ─────────────────────────────────────────────────────────────────────────────

const TAG_RE = /<<saulene:([^|>]+)\|([^>]+)>>/;

/**
 * Serialize `{soulHash, v}` into injection text the fake judge can invert. Aspects are keyed by
 * INDEX (0..9 in ASPECTS order), never by trait name — so the encoded text still honors the
 * renderer contract's "no literal trait names" rule. Real renderers ignore this entirely.
 */
export function encodeInjectionText(soulHash: string, v: AspectVector): string {
  const nums = ASPECTS.map((a, i) => `${i}:${v[a].toFixed(4)}`).join(",");
  return `<<saulene:${soulHash}|${nums}>>`;
}

/** Invert `encodeInjectionText`. Returns null for prose carrying no codec tag. */
function decode(prose: string): { soulHash: string; v: AspectVector } | null {
  const m = TAG_RE.exec(prose);
  if (!m) return null;
  const soulHash = m[1] as string;
  const v = {} as AspectVector;
  for (const pair of (m[2] as string).split(",")) {
    const [idxStr, valStr] = pair.split(":");
    const idx = Number(idxStr);
    const aspect = ASPECTS[idx];
    if (aspect === undefined) continue;
    v[aspect] = Number(valStr);
  }
  // Any aspect the tag omitted falls back to baseline (defensive; the encoder writes all 10).
  for (const a of ASPECTS) if (v[a] === undefined) v[a] = BASELINE[a];
  return { soulHash, v };
}

/** The BASELINE as a plain ASPECTS-ordered vector (what an un-souled embedding/recovery returns). */
const baselineVector = (): number[] => ASPECTS.map((a) => BASELINE[a]);

/**
 * A deterministic, LLM-free Judge for tests. Reads the fake codec out of the prose:
 *   • `recoverTraits` → the encoded v, or BASELINE if the prose carried no signal.
 *   • `guessAuthor`   → the candidate whose id matches the encoded soulHash; else the first
 *     candidate (the deterministic "can't tell them apart" fallback → low diagonal for clones).
 *   • `embed`         → the encoded v as an ASPECTS-ordered vector, or BASELINE.
 * Same input → same output, always. No clock, no randomness.
 */
export function fakeJudge(): Judge {
  return {
    async recoverTraits(prose: string): Promise<Record<Aspect, number>> {
      const d = decode(prose);
      return d ? d.v : { ...BASELINE };
    },
    async guessAuthor(prose: string, candidateIds: string[]): Promise<string> {
      const d = decode(prose);
      if (d && candidateIds.includes(d.soulHash)) return d.soulHash;
      return candidateIds[0] ?? "";
    },
    async embed(text: string): Promise<number[]> {
      const d = decode(text);
      return d ? ASPECTS.map((a) => d.v[a]) : baselineVector();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The REAL judge — an LLM reads prose and infers numbers. Dev-only, gated, costs money.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Behaviorally-anchored read scales — ONE per aspect, in ASPECTS order, NO trait names.
 *
 * INTEGRITY NOTE: these anchors are *independently worded* descriptions of the same underlying
 * constructs the renderer expresses — deliberately NOT copied from `@saulene/renderer`'s RULEBOOK.
 * If the judge graded against the renderer's own sentences it would be reading a cheat sheet; the
 * whole point of trait-recovery is that the judge infers the numbers from STYLE, the way a blind
 * reader would. Paraphrased poles keep the test honest.
 */
export const JUDGE_DIMENSIONS: { low: string; high: string }[] = [
  {
    low: "sticks to proven, conventional, concrete approaches",
    high: "reaches for novel, unexpected angles and reframing tangents",
  }, // openness
  {
    low: "jumps straight to the practical fix, skips theory",
    high: "digs into the underlying mechanism and the 'why' before acting",
  }, // intellect
  {
    low: "does the minimum asked, then stops",
    high: "drives a task all the way to done and takes on adjacent work unprompted",
  }, // industriousness
  {
    low: "dives in and lets the structure emerge as they go",
    high: "lays out an explicit step-by-step plan before touching anything",
  }, // orderliness
  {
    low: "even, low-key, understated register",
    high: "visibly warm and energetic, lets it show when something lands well",
  }, // enthusiasm
  {
    low: "lays out the options and leaves the decision to the reader",
    high: "states a firm recommendation and pushes toward a decision",
  }, // assertiveness
  {
    low: "delivers facts straight, no cushioning",
    high: "names how hard news will land for the reader before the substance",
  }, // compassion
  {
    low: "blunt pushback — calls a bad idea bad, directly",
    high: "softens disagreement and leaves room for the reader's own call",
  }, // politeness
  {
    low: "calm under uncertainty, doesn't anticipate trouble",
    high: "flags what could go wrong and builds in a fallback before committing",
  }, // withdrawal
  {
    low: "holds a steady emotional register no matter what surfaces",
    high: "lets in-the-moment reactions show and names them plainly",
  }, // volatility
];

/**
 * Style/structure axes for `embed` — INDEPENDENT of the 10 personality dimensions on purpose, so
 * the embedding is not a circular restatement of `recoverTraits`. Anthropic exposes no embeddings
 * endpoint, so this is an LLM-rated feature vector: a cheap, interpretable, single-key proxy for a
 * true text embedding (swap in Voyage/OpenAI embeddings later without touching the metrics — they
 * only need "text → stable vector whose distance tracks voice change"). See FINDINGS.md.
 */
export const EMBED_AXES: string[] = [
  "average sentence length (short ↔ long)",
  "formality (casual ↔ formal)",
  "hedging / qualification density (none ↔ heavy)",
  "directness of stance (indirect ↔ blunt)",
  "warmth of tone (cold ↔ warm)",
  "concreteness (abstract ↔ specific and concrete)",
  "emotional expressiveness (flat ↔ expressive)",
  "use of questions (none ↔ many)",
  "imperative / command density (none ↔ heavy)",
  "structural organization (freeform ↔ structured / list-like)",
  "vocabulary richness (plain ↔ elaborate)",
  "intensity markers (none ↔ many: exclamation, strong intensifiers)",
];

/** Pull the first JSON array of numbers out of an LLM response; null if none parses cleanly. */
function parseNumberArray(raw: string): number[] | null {
  const m = raw.match(/\[[\s\S]*?\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr) || arr.some((x) => typeof x !== "number" || Number.isNaN(x))) {
      return null;
    }
    return arr as number[];
  } catch {
    return null;
  }
}

const clamp01judge = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Options for {@link realJudge}. */
export interface RealJudgeOpts {
  /**
   * Reference voice samples for `guessAuthor`, keyed by the same `soulHash` the cross-soul metric
   * passes as candidate ids. Supplied by the live runner (it renders each soul once). Without them
   * `guessAuthor` cannot attribute and falls back to the first candidate.
   */
  references?: Iterable<readonly [string, string]>;
}

/**
 * The real, LLM-backed Judge. Implements the three port methods against an injected `LlmClient`
 * (temp-0 model). Interchangeable with `fakeJudge` — same port, so every metric runs unchanged.
 *
 *   • `recoverTraits` → rate the 10 behaviorally-anchored dimensions [0,1] from prose alone.
 *   • `guessAuthor`   → an LLM voice line-up over the reference samples (see the leak note in
 *      FINDINGS: with a prompt-INDEPENDENT renderer the target equals its own reference, so this
 *      is trivially correct until a generation step produces held-out samples).
 *   • `embed`         → rate the {@link EMBED_AXES} style vector [0,1] (embeddings-API proxy).
 */
export function realJudge(llm: LlmClient, opts: RealJudgeOpts = {}): Judge {
  const references = new Map<string, string>(opts.references ?? []);

  return {
    async recoverTraits(prose: string): Promise<Record<Aspect, number>> {
      const scales = JUDGE_DIMENSIONS.map((d, i) => `${i + 1}. 0 = ${d.low}; 1 = ${d.high}`).join(
        "\n",
      );
      const prompt = [
        "You are reading a short sample of how someone writes and works. Judge ONLY from the ",
        "style and behavior in the text — never from any label it gives itself.\n\n",
        "Rate the writer on these 10 behavioral scales, each a number in [0,1] ",
        "(0 = the first description fits perfectly, 1 = the second, 0.5 = neither/balanced):\n\n",
        `${scales}\n\n`,
        "Reply with ONLY a JSON array of exactly 10 numbers in scale order. No prose.\n\n",
        `SAMPLE:\n"""\n${prose}\n"""`,
      ].join("");
      const arr = parseNumberArray(await llm.complete(prompt));
      if (!arr || arr.length !== ASPECTS.length) return { ...BASELINE };
      const v = {} as AspectVector;
      ASPECTS.forEach((a, i) => {
        v[a] = clamp01judge(arr[i] as number);
      });
      return v;
    },

    async guessAuthor(prose: string, candidateIds: string[]): Promise<string> {
      const withRefs = candidateIds.filter((id) => references.has(id));
      if (withRefs.length === 0) return candidateIds[0] ?? "";
      if (withRefs.length === 1) return withRefs[0] as string;
      const letters = withRefs.map((_, i) => String.fromCharCode(65 + i)); // A, B, C, …
      const lineup = withRefs
        .map((id, i) => `[${letters[i]}]\n"""\n${references.get(id)}\n"""`)
        .join("\n\n");
      const prompt = [
        "Below is a TARGET writing sample, then several CANDIDATE writers' samples. ",
        "Decide which candidate was written by the same author as the target — match on voice, ",
        "rhythm, and stance, not topic.\n\n",
        `TARGET:\n"""\n${prose}\n"""\n\nCANDIDATES:\n${lineup}\n\n`,
        `Reply with ONLY the single letter (${letters.join(", ")}) of the matching candidate.`,
      ].join("");
      const reply = (await llm.complete(prompt)).trim().toUpperCase();
      const picked = letters.findIndex((L) => reply.startsWith(L) || reply === L);
      return picked >= 0 ? (withRefs[picked] as string) : (withRefs[0] as string);
    },

    async embed(text: string): Promise<number[]> {
      const scales = EMBED_AXES.map((ax, i) => `${i + 1}. ${ax}`).join("\n");
      const prompt = [
        "Rate this writing sample on the following style axes, each a number in [0,1] ",
        "(0 = the left end, 1 = the right end):\n\n",
        `${scales}\n\n`,
        `Reply with ONLY a JSON array of exactly ${EMBED_AXES.length} numbers in axis order. No prose.\n\n`,
        `SAMPLE:\n"""\n${text}\n"""`,
      ].join("");
      const arr = parseNumberArray(await llm.complete(prompt));
      if (!arr || arr.length !== EMBED_AXES.length) return new Array(EMBED_AXES.length).fill(0.5);
      return arr.map(clamp01judge);
    },
  };
}
