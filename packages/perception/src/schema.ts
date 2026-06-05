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
 */

// TODO(perception): Observation, Ledger, SessionJudgment as zod schemas — zod is the source
// of truth for these types (z.infer), and we validate the LLM output at this boundary (the LLM
// is an untrusted input). Derive the LLM's JSON Schema from the same zod definitions. Add zod
// as a dependency when this is implemented (not before — no other case needs it yet).

export {};
