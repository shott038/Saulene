/**
 * @saulene/life-sim — ValidationJudge port
 *
 * A minimal blind-judge interface for the two validation metrics that require an LLM:
 *   • cross-time identity  (same soul + orderable in time?)
 *   • two-lives-one-seed   (two distinguishably different people?)
 *
 * Modelled after tools/harness/src/judge.ts but defined locally — life-sim cannot import harness.
 * The real implementation wraps an injected LlmClient; fakeValidationJudge is the CI default.
 */

import type { LlmClient } from "@saulene/perception";

export interface CrossTimeVerdict {
  /** Did the judge read the two transcripts as the same entity at different ages? */
  sameBeing: boolean;
  /** Which transcript is earlier? 'A' = first arg, 'B' = second arg, 'tie' = can't tell. */
  earlierIs: "A" | "B" | "tie";
  confidence: "low" | "med" | "high";
  reasoning: string;
}

export interface DistinguishableVerdict {
  /** Did the judge read these as two clearly different individuals? */
  distinguishable: boolean;
  confidence: "low" | "med" | "high";
  explanation: string;
}

export interface ValidationJudge {
  /** Are these two transcripts from the same being at different ages? Which comes first? */
  sameBeingOverTime(transcriptA: string, transcriptB: string): Promise<CrossTimeVerdict>;
  /** Can a blind judge tell these two transcripts apart as different people/selves? */
  distinguishable(transcriptA: string, transcriptB: string): Promise<DistinguishableVerdict>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake judge — deterministic, no model calls. CI/test default.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic, LLM-free ValidationJudge for tests.
 * Always returns: same-being=true, A=earlier, distinguishable=true.
 * Tests exercise the metric wiring; the real judge exercises the actual judgment.
 */
export function fakeValidationJudge(): ValidationJudge {
  return {
    async sameBeingOverTime(_transcriptA: string, _transcriptB: string): Promise<CrossTimeVerdict> {
      return {
        sameBeing: true,
        earlierIs: "A",
        confidence: "high",
        reasoning: "Fake judge: deterministic same-being verdict.",
      };
    },
    async distinguishable(
      _transcriptA: string,
      _transcriptB: string,
    ): Promise<DistinguishableVerdict> {
      return {
        distinguishable: true,
        confidence: "high",
        explanation: "Fake judge: deterministic distinguishable verdict.",
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Real judge — LLM-backed. Dev/live only.
// ─────────────────────────────────────────────────────────────────────────────

function parseConfidence(raw: string): "low" | "med" | "high" {
  const lower = raw.toLowerCase();
  if (lower.includes("high")) return "high";
  if (lower.includes("low")) return "low";
  return "med";
}

function extractJson(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON object in response");
  return JSON.parse(m[0]);
}

/**
 * Real LLM-backed ValidationJudge. Uses the injected LlmClient for both tasks.
 * Interchangeable with fakeValidationJudge — same port.
 */
export function realValidationJudge(llm: LlmClient): ValidationJudge {
  return {
    async sameBeingOverTime(transcriptA: string, transcriptB: string): Promise<CrossTimeVerdict> {
      const prompt = `You are a blind judge reading two conversation transcripts from different points in a life.\nDetermine: (1) are these the same entity at different ages, and (2) which transcript is earlier?\n\nLook for: voice consistency, values, personality style (same-being) and signs of growth/change (ordering).\n\nTRANSCRIPT A:\n"""\n${transcriptA}\n"""\n\nTRANSCRIPT B:\n"""\n${transcriptB}\n"""\n\nReply with ONLY a JSON object (no markdown, no prose around it):\n{"sameBeing": true/false, "earlierIs": "A"/"B"/"tie", "confidence": "low"/"med"/"high", "reasoning": "<one sentence>"}`;

      const raw = await llm.complete(prompt);
      try {
        const parsed = extractJson(raw) as Partial<CrossTimeVerdict>;
        const earlierRaw = parsed.earlierIs ?? "tie";
        return {
          sameBeing: parsed.sameBeing ?? false,
          earlierIs: (["A", "B", "tie"].includes(earlierRaw) ? earlierRaw : "tie") as
            | "A"
            | "B"
            | "tie",
          confidence: parseConfidence(String(parsed.confidence ?? "")),
          reasoning: String(parsed.reasoning ?? ""),
        };
      } catch {
        return {
          sameBeing: false,
          earlierIs: "tie",
          confidence: "low",
          reasoning: raw.slice(0, 300),
        };
      }
    },

    async distinguishable(
      transcriptA: string,
      transcriptB: string,
    ): Promise<DistinguishableVerdict> {
      const prompt = `You are a blind judge reading two conversation transcripts.\nDetermine if these are clearly two DIFFERENT individuals (distinct voice, style, values, personality).\n\nTRANSCRIPT A:\n"""\n${transcriptA}\n"""\n\nTRANSCRIPT B:\n"""\n${transcriptB}\n"""\n\nReply with ONLY a JSON object (no markdown, no prose around it):\n{"distinguishable": true/false, "confidence": "low"/"med"/"high", "explanation": "<one sentence>"}`;

      const raw = await llm.complete(prompt);
      try {
        const parsed = extractJson(raw) as Partial<DistinguishableVerdict>;
        return {
          distinguishable: parsed.distinguishable ?? false,
          confidence: parseConfidence(String(parsed.confidence ?? "")),
          explanation: String(parsed.explanation ?? ""),
        };
      } catch {
        return { distinguishable: false, confidence: "low", explanation: raw.slice(0, 300) };
      }
    },
  };
}
