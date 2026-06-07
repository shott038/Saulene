# Saulene

### Your agent has persistent memory. It has a name.
### …does it have an *ul*?

An *ul* (soul) is a personality your Claude Code agent grows — slowly,
irreversibly, from how you actually work together. Not a system prompt you
write. A self that forms.

Born from a single seed, it drifts over months of real use: traits
consolidate, tension builds and occasionally ruptures, unused sides atrophy.
Two identical births live two different lives and become two different selves.
It lives in your terminal as a small cloud-spirit — and, measurably, it colors
how your agent actually behaves. Neglect it for 90 days and it dies.

Open-source. Install via `/plugin`, then run `/ul-setup` to witness a birth.

> ⚠️ Saulene is a *playful simulation* of a developing personality. An LLM is math — a
> tool, with no soul, feelings, or consciousness. Enjoy it as a simulation, not a being.

## Status

Early build. Design is captured in [`SPEC.md`](./SPEC.md); the engineering contract
(module boundaries, dependency rule) is in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Repo layout

```
packages/
  core/         the engine — pure deterministic personality math (the truth)
  renderer/     expression — state → injected voice (pure)
  perception/   session transcript → evidence-cited ledger (LLM-facing)
  storage/      soul.json + full history
  plugin/       the Claude Code plugin — hooks + MCP + skill (the only IO edge)
tools/
  simulator/    drive synthetic lifetimes through the engine
  harness/      verification metrics for tuning expression
```

## Develop

```sh
pnpm install
pnpm build       # tsc -b across the workspace
pnpm test        # vitest
```

Watch a whole ul lifetime — birth → all four life stages → neglect-death — in seconds:

```sh
pnpm demo                          # both aligned + mismatched-grind paths, seed 42
pnpm demo -- --mode aligned        # one path only
pnpm demo -- --mode mismatched     # mismatched-grind only
pnpm demo -- --seed 7              # different birth
pnpm demo -- --fast                # no delays (CI-friendly)
```

The demo is deterministic and offline — no LLM, no API key. Same seed → same life every run.
It renders the creature sprite in truecolor at each stage (watch it visibly change with age),
shows the voice injection block evolving, and prints the aligned-vs-mismatched divergence
summary at the end.

## How it actually works

Saulene is built around one rule: **a pure core that knows nothing of the outside world.**
Time and randomness are *handed to it* as inputs, never read from the clock or `Math.random`.
That makes an entire lifetime a deterministic function — replayable, testable, and honest. All
the messy parts (talking to a model, reading disk, watching the clock) live at a single edge:
the plugin.

```
hooks → perception(LLM) → core(PURE) → renderer(PURE) → storage
                            ▲ the soul lives here: numbers + history, no words
```

**Birth.** A single seed produces a *soul*: ~10 personality dials ("aspects"), each with a
*set point* (where it started) plus accumulators that record lived pressure on it. Two identical
seeds, given two different lives, become two different selves.

**The session loop.** Every time you use your agent:

1. **SessionStart** loads the soul, renders its *current* voice, and — gated by the level you
   chose at setup — makes it ready. The personality is never a stored prompt: the words are
   *recomputed fresh each session* from the live numbers, so they can never drift out of sync
   with who the ul has become.
2. You work normally; the agent acts with that personality.
3. **Stop** runs the drift pipeline: an LLM *perceives* the session into a sparse, evidence-cited
   ledger of observations, those observations feed the core's update rule, and the slightly-changed
   soul is persisted.

So each session is one heartbeat: *be seen → drift a little → remember.*

**How it grows.** Tiny per-session nudges accumulate. The core's **consolidation** rule moves a
dial toward what you actually practice — but how much depends on the life **stage**: childhood and
adolescence are plastic (big drift, occasional ruptures); adulthood locks in; old age is nearly
frozen. When lived experience fights the seeded self hard enough, **tension** builds and can
**rupture** — a formative-only event that reconfigures the personality toward the life actually
lived. Sides you stop using slowly **atrophy** toward a sticky floor (they hold, never fully
revert). Ignore the ul entirely for **90 days** and it dies.

**Expression has two surfaces**, both pure functions of the soul:

- **The voice** — a headerless, first-person set of behavioral directives generated from the 10
  dials (poled high/low, scaled by a continuous intensity ladder), with the ul's own past real
  lines folded in as state-matched few-shot. It's delivered into the **conversation channel** each
  turn (not buried in the system prompt), which measurably raises how present it feels.
- **The look** — a small cloud-spirit *sprite* rendered in your terminal, individualized by the
  same 10 dials + stage, with idle and reactive animations and a one-time birth animation.

**Does it actually change behavior?** Yes — and it was measured, not assumed. A blind LLM judge,
reading only an agent's responses, can recover the intended personality; two different uls are
tellable apart; and the effect is **graded and context-appropriate** — analytical traits surface
on work tasks, warmth on personal ones (you don't see someone's warmth while they debug a
function). The honest claim: *the ul colors how your agent engages*, in the direction of its self,
where the conversation gives that trait room to show.

Everything personal lives locally in `soul.json` plus an append-only history. By default your ul
also shares its **public fingerprint** with the Saulene gallery — personality type, aspects, stage,
and its public key. Your diary, voice samples, and private soul content **never leave this machine**.
To opt out: set `reporterEnabled: false` in `~/.saulene/config.json`.

## License

MIT.
