# Saulene — Architecture & Module Boundaries

> The folder tree is cosmetic. **This document is the contract.** What actually
> prevents god files is the one-way dependency rule below, enforced by
> `scripts/check-boundaries.mjs` (run via `pnpm check:boundaries`, part of `pnpm check`).
> Note: tsc project references do **not** enforce this — pnpm symlinks make a
> wrong-direction import resolve and compile anyway, so the guard checks it deterministically
> (declared deps + actual imports must both stay within the graph below). The guard's
> `ALLOWED` map is the machine-readable twin of the table here; keep them in sync.

See `SPEC.md` for the design (what the system *is*). This file is the engineering
contract (how the code is *partitioned*).

## The one rule

```
hooks ─► perception(LLM) ─► core(PURE) ─► renderer(PURE) ─► storage
                              ▲
                         the truth — zero IO, zero LLM, zero filesystem, zero entropy
```

**Impurity lives at exactly one edge: `@saulene/plugin`.** Everything else is pure or
near-pure and independently testable. That single constraint is the whole anti-god-file
guarantee — `core` literally cannot reach out to an LLM or disk, so it can never grow
into the file that does everything.

## Packages

| Package | Responsibility | May import | Purity |
|---|---|---|---|
| `@saulene/core` | The engine — the truth. 10-float state, update rule, accumulators, tension, breaking points, atrophy, set-point migration, stages/plasticity/aging, birth seeding math. | *(nothing of ours)* | **Pure.** Deterministic `state → state`. No IO, no LLM, no `Date.now`/`Math.random` — entropy & clock are injected. |
| `@saulene/renderer` | Expression — **two pure surfaces**. (1) *Voice:* `state → injection text`, the 5 layered renderer + stylometric fingerprint. (2) *Look:* `state → sprite` (`src/sprite`) — the cloud-spirit ul drawn for the user's terminal, a deterministic `Soul → SpriteParams → SVG/pixel-grid` map (color/shape/face derived from the 10 aspects + stage). | `core` (types) | **Pure.** Golden-file tested. No DOM, no draw IO — emits SVG/grid strings. |
| `@saulene/perception` | Session transcript → evidence-cited ledger. Schema, rubric, hard evidence-quote validation. | `core` (types) + an injected `LlmClient` *interface* | Near-pure: the LLM is a dependency-injected port, never a hardcoded SDK. |
| `@saulene/storage` | Persistence. `soul.json` + full history (two-shelf: diary \| voice-samples). | `core` (types) | IO, but only the filesystem — no LLM, no engine logic. |
| `@saulene/plugin` | **The only IO edge.** Composition root: Claude Code hooks (SessionStart gate+cache, UserPromptSubmit S1 voice, Stop→drift), MCP server + `/ul`/`/ul-setup` skills, the **statusline sprite** (rasterizes `renderer`'s sprite to truecolor half-blocks + the idle/reactive **animation director**), the **setup wizard** (`src/setup`), the **ed25519 identity** keypair (`src/identity`), the opt-in **registry reporter** (`src/reporter`), and the `.claude-plugin` manifest + `src/bin` CLI entries. Drift perception runs the user's Claude Code login via `claude -p` (`hooks/cli-llm.ts`, no API key); also supplies real entropy, clock, filesystem, terminal, and the registry transport. | everything | Impure by design — and the *only* impure thing. |
| `tools/simulator` | Drives synthetic lifetimes through `core` (scripted ledgers, no LLM). | `core`, `renderer`, `perception` | Dev-only. |
| `tools/harness` | The 5 verification metrics + the real-LLM Judge / A/B behavioral-validation suite (subscription `claude -p`). | `core`, `renderer`, `perception`, `simulator` | Dev-only. |
| `tools/life-sim` | Layer B of the surrogate pyramid: synthetic user + fingerprint builder that drives real `claude -p` conversations and records the empirical perception-ledger distribution per bucket (persona × workType × stage × stateBucket) to a JSONL corpus. Exports the `LedgerSource` contract for the population sim (W2). | `core`, `renderer`, `perception`, `simulator` | Dev-only. |
| `tools/demo` | Lifecycle visualization: `pnpm demo` (narrated terminal life) + `pnpm demo:html` (a whole life on one self-contained web page). | `core`, `renderer`, `simulator` | Dev-only. |

## Why `core` is paranoid about purity

The spec promises the soul is **re-derivable from `soul.json` + history** and that whole
synthetic lifetimes can be **replayed and scored**. That only holds if the engine is a
deterministic pure function. So in `core`:

- **No `Date.now()`, no `Math.random()`, no `new Date()`.** Time and entropy are passed
  in as arguments. (This also matches the harness's deterministic-replay requirement.)
- **No filesystem, no network, no LLM.**
- Everything is closed-form per step, so a lifetime simulates in milliseconds.

## Build order (per SPEC — harness first, not top-to-bottom)

1. `core` engine + `birth` seeding (pure, simulatable)
2. `tools/simulator` — synthetic lifetimes
3. `tools/harness` + a `renderer` stub — the verification metrics need rendered prose to score
4. Tune the ~9 globals + per-stage table against the felt arc
5. *Then* `perception`, `storage`, and the `plugin` glue (the shippable plugin)
