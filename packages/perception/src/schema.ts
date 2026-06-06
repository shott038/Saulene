/**
 * @saulene/perception — schema
 *
 * The session-judgment output: "Diary + Evidence-Cited Sparse Practice/Fit Ledger".
 *
 * Layer A — engine-facing ledger: a SPARSE list of observations (only aspects genuinely
 *   exercised). Each: aspect, mode (task|interaction), practice (0–3), fit (−3..+3),
 *   confidence, evidence_quote (hard-validated), first_person_note, salience, optional
 *   appraisal handles.
 * Layer B — diary: a short first-person entry the engine ignores (legibility + fine-tune
 *   corpus), generated AFTER the ledger so it can't contaminate the extract.
 *
 * zod is the SOURCE OF TRUTH here: the runtime types come from `z.infer`, the LLM output is
 * validated against these schemas (the LLM is an untrusted input), and the LLM's structured-
 * output JSON Schema is DERIVED from these same definitions (`toJsonSchema`) so the prompt
 * contract and the validator can never drift.
 */

import { ASPECTS, type Aspect } from "@saulene/core";
import { z } from "zod";

/** The 10 aspects as a zod enum, built from core's canonical tuple (no drift). */
const aspectEnum = z.enum([...ASPECTS] as [Aspect, ...Aspect[]]);

/**
 * One sparse ledger row — an aspect genuinely exercised this session. SPARSE by design:
 * never force-fill all 10. `practice` and `fit` are ORTHOGONAL (a high-practice/negative-fit
 * row — "did a lot but hated it" — must round-trip).
 */
export const ObservationSchema = z.object({
  /** One of the 10 Big Five aspects (engine truth). */
  aspect: aspectEnum,
  /** `task` vs `interaction` — two channels, so emotional aspects aren't swallowed by work. */
  mode: z.enum(["task", "interaction"]),
  /** How MUCH the aspect was exercised — anchored ordinal 0–3. */
  practice: z.number().int().min(0).max(3),
  /** How it LANDED for the ul — signed −3..+3, orthogonal to practice. */
  fit: z.number().int().min(-3).max(3),
  /** Engine down-weights shaky reads. */
  confidence: z.enum(["low", "med", "high"]),
  /** Verbatim transcript span — HARD-validated downstream (the anti-hallucination gate). */
  evidence_quote: z.string().min(1),
  /** Short "I…" gloss of the ul's own experience (first-person locked — see validate). */
  first_person_note: z.string().min(1),
  /** How formative, 0–3 (no hard cap on observation count). */
  salience: z.number().int().min(0).max(3),
  /** Optional appraisal handle: did it serve the ul's goals (−3..+3). */
  goal_congruence: z.number().int().min(-3).max(3).optional(),
  /** Optional appraisal handle: how much the ul drove it (0–3). */
  agency: z.number().int().min(0).max(3).optional(),
  /** Optional salience tag: deviation from current personality (0–3). NOT a primary signal. */
  surprise_vs_self: z.number().int().min(0).max(3).optional(),
});

/**
 * The full session judgment. `observations` is Layer A (engine-facing); `diary` is Layer B,
 * a short first-person entry the engine IGNORES (legibility + fine-tune corpus).
 * `session_significance` is bounded [0,1] (feeds MP/age — "barely mattered" is cheap+common);
 * `schema_version` stamps the scale for re-scoring across model swaps.
 */
export const SessionJudgmentSchema = z.object({
  observations: z.array(ObservationSchema),
  session_significance: z.number().min(0).max(1),
  schema_version: z.string().min(1),
  diary: z.string(),
});

export type Observation = z.infer<typeof ObservationSchema>;
export type SessionJudgment = z.infer<typeof SessionJudgmentSchema>;

// ── JSON Schema derivation ──────────────────────────────────────────────────────
// Derived from the SAME zod definitions above so the LLM's structured-output contract
// and the runtime validator are guaranteed to describe the same shape. A minimal walker
// over only the zod node types these schemas use — not a general converter.

/** A plain JSON-Schema object (the subset emitted here). */
export type JsonSchema = Record<string, unknown>;

/**
 * Emit a JSON Schema for one of this module's zod schemas. Handles exactly the constructs
 * used above (object/array/string/number/enum/literal/optional/effects); anything else
 * throws loudly rather than silently emitting a wrong contract.
 */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  // zod 3 keeps the node kind on `_def.typeName`; the shapes below are version-pinned (^3.23).
  const def = schema._def as {
    typeName: string;
    [k: string]: unknown;
  };

  switch (def.typeName) {
    case "ZodObject": {
      const shape = (def.shape as () => Record<string, z.ZodTypeAny>)();
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, child] of Object.entries(shape)) {
        properties[key] = toJsonSchema(child);
        if (child._def.typeName !== "ZodOptional") required.push(key);
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    case "ZodArray":
      return { type: "array", items: toJsonSchema(def.type as z.ZodTypeAny) };
    case "ZodString":
      return { type: "string" };
    case "ZodNumber": {
      const out: JsonSchema = { type: "number" };
      for (const c of (def.checks as Array<{ kind: string; value?: number }>) ?? []) {
        if (c.kind === "int") out.type = "integer";
        else if (c.kind === "min") out.minimum = c.value;
        else if (c.kind === "max") out.maximum = c.value;
      }
      return out;
    }
    case "ZodEnum":
      return { type: "string", enum: [...(def.values as readonly string[])] };
    case "ZodLiteral":
      return { const: def.value };
    case "ZodOptional":
      return toJsonSchema(def.innerType as z.ZodTypeAny);
    case "ZodEffects":
      return toJsonSchema(def.schema as z.ZodTypeAny);
    default:
      throw new Error(`toJsonSchema: unhandled zod type ${def.typeName}`);
  }
}
