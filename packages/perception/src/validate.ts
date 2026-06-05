/**
 * @saulene/perception — validate
 *
 * The anti-hallucination gate: every `evidence_quote` must be a verbatim span literally
 * present in the transcript (rejected otherwise). Plus the first-person lock — a validator
 * rejects any user-profiling; the user may appear ONLY inside evidence_quote. The
 * structural enforcement of the no-mirror guarantee.
 */

// TODO(perception): validateLedger(ledger, transcript) — quote presence + first-person lock.

export {};
