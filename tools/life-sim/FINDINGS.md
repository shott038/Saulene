# life-sim — Findings

## Layer B: Perception-Fingerprint Corpus

### What this package does

`tools/life-sim` implements Layer B of the surrogate pyramid. It:

1. **SyntheticUser** — generates the user side of a multi-turn conversation, persona-driven (4 personas × 5 workTypes), via an injected `LlmClient`.
2. **Conversation runner** — drives a 2–4 turn synthetic user ↔ ul exchange, with `render(soul).text` injected as the ul's voice (mirroring the plugin's S1 injection). Outputs a transcript string parseable by `perceive()`.
3. **Fingerprint builder** — iterates over the bucket space (4×5×4×3 = 240 buckets), runs real `perceive()` on each transcript, records `{bucket, ledger, meta}` to a JSONL corpus.
4. **LedgerSource contract** — `CorpusLedgerSource` samples `ScriptedSession` ledgers from the corpus deterministically (injected `SeededRng`), exporting the `LedgerSource` interface W2 consumes.

### Bucket coverage

Full bucket space: **240 buckets** = 4 personas × 5 workTypes × 4 stages × 3 stateBuckets.

| Axis | Values |
|---|---|
| Persona | creative-warm, technical-curt, adventurous-social, analytical-reserved |
| WorkType | deep-focus, collaboration, creative-exploration, learning, admin |
| Stage | childhood, adolescence, early_adulthood, old_adulthood |
| StateBucket | high-energy (avg(v)>0.65), neutral, depleted (avg(v)<0.35) |

The starter `live.ts` corpus run uses the `neutral` stateBucket × all personas/workTypes × 4 stages = 80 buckets × 3 representative souls = **240 sessions**. The full grid takes 720 sessions (all stateBuckets).

### Sanity check — expected signal polarity

Based on the bucket design:

- **Grind buckets** (e.g., `technical-curt`/`admin`/`depleted`): expectation is **negative fit** for most aspects — the user is misaligned, fatigued, or in an environment that doesn't suit them. Perception should return fit < 0 for the dominant aspects.

- **Aligned buckets** (e.g., `creative-warm`/`creative-exploration`/`high-energy`): expectation is **positive fit** for openness/enthusiasm aspects — the persona's warmth and creative work type align. Perception should return fit > 0.

These polarities are what the real corpus run (`SAULENE_LIVE=1 pnpm --filter @saulene/life-sim corpus`) should verify. The corpus JSONL provides the empirical distribution; W2 samples from it rather than guessing.

### Key design decisions

- **Evidence-quote gate**: `perceive()` strips any observation whose `evidence_quote` doesn't appear verbatim in the transcript. This means the corpus records contain only validated, quote-backed observations — no hallucinated signals.
- **Deterministic replay**: `SeededRng` + no `Math.random` anywhere in `life-sim` → W2 lifetimes are byte-reproducible given the same seed.
- **Cache**: `LifeSimCache` (FNV-1a hash) means re-running the corpus builder is free after the first real pass.

### Notes for W2

The `LedgerSource` interface is in `src/ledger-source.ts`:

```ts
interface LedgerSource {
  next(soul: Soul, ctx: SessionContext): ScriptedSession;
}
```

Inject a `CorpusLedgerSource` (loaded from the JSONL file) or implement the interface directly. `parseCorpus(jsonl)` loads the file.
