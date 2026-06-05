/**
 * @saulene/storage — public surface
 *
 * Persistence for the one global soul at `~/.saulene/soul.json`, plus FULL history
 * (every session's ledger, drift, diary, voice samples) — not just live state, so the
 * paid fine-tune/LoRA "max" upgrade stays possible.
 *
 * Two-shelf store with a hard label wall: diary (memory/content) physically separate
 * from voice-samples (form/imitation), recombined only at inject time by the renderer.
 *
 * IO is limited to the filesystem here — no LLM, no engine logic.
 */

// TODO(storage): loadSoul / saveSoul; appendLedger / appendDiary / appendVoiceSample;
// TODO(storage): the two-shelf separation + retrieval by state-distance.

export {};
