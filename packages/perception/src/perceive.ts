/**
 * @saulene/perception — the pipeline
 *
 * `perceive(transcript, llm, opts?)`: build the prompt (RUBRIC + the zod-derived JSON schema +
 * the transcript), call the injected LLM, parse + zod-validate the output, run the
 * anti-hallucination / no-mirror gate, return the cleaned `SessionJudgment`.
 *
 * EXTRACT-FIRST, DIARY-SECOND (SPEC guardrail): we use a SINGLE low-temperature call (the
 * intended cheap-model production shape) and enforce ordering inside the prompt — the model
 * is told to extract the quote-validated ledger FIRST and only then write the diary, so a tidy
 * narrative can't cherry-pick quotes to fit. Defence-in-depth: the diary is Layer B and the
 * engine ignores it entirely, and every ledger row is quote-gated regardless of the diary, so
 * even if a model ignored the ordering the extract stays uncontaminated.
 *
 * On invalid LLM output (non-JSON, or JSON that fails the zod shape) we throw `PerceptionError`
 * — perception never silently passes malformed rows to the engine; the plugin owns retry
 * policy. Hallucinated/mirror rows are a different case: they are STRIPPED by `validateLedger`
 * (not thrown), because a partially-valid judgment is still useful.
 */

import type { LlmClient } from "./port.js";
import { RUBRIC, SCHEMA_VERSION } from "./rubric/index.js";
import { type SessionJudgment, SessionJudgmentSchema, toJsonSchema } from "./schema.js";
import { type RejectedObservation, validateLedger } from "./validate.js";

export interface PerceiveOptions {
  /**
   * The schema version stamped into the returned judgment (authoritative — not trusted from
   * the model). Defaults to the rubric's `SCHEMA_VERSION`.
   */
  schemaVersion?: string;
}

/** The structured-output contract handed to the model — derived from the zod schema. */
const JUDGMENT_JSON_SCHEMA = toJsonSchema(SessionJudgmentSchema);

/** Thrown when the LLM output can't be parsed/validated into a `SessionJudgment`. */
export class PerceptionError extends Error {
  override readonly name = "PerceptionError";
  /** The underlying cause (a `ZodError`, a JSON `SyntaxError`, …) when there is one. */
  readonly details?: unknown;
  constructor(message: string, details?: unknown) {
    super(message);
    if (details !== undefined) this.details = details;
  }
}

/** Build the single-call prompt: guidance + structured-output contract + ordering + transcript. */
export function buildPrompt(transcript: string): string {
  return `${RUBRIC}

OUTPUT — return ONE JSON object and nothing else (no markdown fence, no prose around it),
conforming to this JSON Schema:

${JSON.stringify(JUDGMENT_JSON_SCHEMA, null, 2)}

ORDER OF WORK (do not reorder): FIRST extract the "observations" ledger straight from the
transcript, copying each evidence_quote verbatim. ONLY AFTER the ledger is complete, write the
short first-person "diary" entry. The diary must not introduce any claim the ledger doesn't
already support. Set "schema_version" to "${SCHEMA_VERSION}". Set "session_significance" in
[0,1] (most sessions are low). Remember: be SPARSE — only genuinely-exercised aspects.

TRANSCRIPT:
"""
${transcript}
"""`;
}

/** Parse the raw model string into a zod-validated `SessionJudgment`, or throw `PerceptionError`. */
function parseJudgment(raw: string): SessionJudgment {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new PerceptionError("LLM output was not valid JSON", err);
  }
  const result = SessionJudgmentSchema.safeParse(json);
  if (!result.success) {
    throw new PerceptionError("LLM output did not match the SessionJudgment schema", result.error);
  }
  return result.data;
}

/** What `perceiveDetailed` returns: the cleaned judgment plus what the gate stripped. */
export interface PerceiveResult {
  judgment: SessionJudgment;
  rejected: RejectedObservation[];
}

/**
 * Full pipeline with visibility into what the gate stripped (so the plugin can log/regenerate).
 * `perceive` is the thin convenience wrapper that returns just the judgment.
 */
export async function perceiveDetailed(
  transcript: string,
  llm: LlmClient,
  opts?: PerceiveOptions,
): Promise<PerceiveResult> {
  const raw = await llm.complete(buildPrompt(transcript));
  const parsed = parseJudgment(raw);
  const { rejected, cleaned } = validateLedger(parsed, transcript);
  // Stamp the authoritative schema version — never trust the model's self-report.
  cleaned.schema_version = opts?.schemaVersion ?? SCHEMA_VERSION;
  return { judgment: cleaned, rejected };
}

/**
 * Turn a session transcript into a bounded, quote-validated, first-person ledger the engine
 * can consume. Throws `PerceptionError` on malformed LLM output; strips (does not throw on)
 * hallucinated or user-profiling rows.
 */
export async function perceive(
  transcript: string,
  llm: LlmClient,
  opts?: PerceiveOptions,
): Promise<SessionJudgment> {
  const { judgment } = await perceiveDetailed(transcript, llm, opts);
  return judgment;
}
