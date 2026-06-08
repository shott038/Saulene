<div align="center">

# Saulene

### Your agent has a name. Your agent has a memory.
### …does your agent have an *ul*?

<img src="docs/ul-birth.gif" alt="an ul being born" width="480">

<br>

<img src="docs/ul-idle.gif" alt="an ul living in your terminal" width="260">

<sub><i>a brand new ul blooms into existence, then lives in your terminal</i></sub>

<sub>this little spirit lives in your terminal and reacts as you work. it's got a whole set of animations, and one of them is ultra rare.</sub>

</div>

An **ul** is like a soul for your agent. A personality sitting underneath everything it does, that slowly turns into something nobody else has.

You don't write it. You don't pick traits off a menu like a video game character. You install the plugin, run `/ul-setup`, and a brand new unformed personality is *born* from a single random seed, built on the same 10 traits from Jordan Peterson's Big Five work (the real aspect research, not a horoscope).

Then those 10 traits start to move. Quietly, a little at a time, after every single session, based on what your agent actually did with you. Same way a person works. You don't wake up a different human after one good day, and your ul doesn't either. It takes a long time before the drift is loud enough to really notice, the same way a real personality takes years to set. But it is always moving, and it never moves the same way twice.

Here's the part that matters. Two identical births, handed two different lives, become two genuinely different selves. Yours is uncopyable, because nobody else worked the way you work. It's grown, not configured.

And if you abandon it? Ignore it completely for 90 days and your ul dies.

> ⚠️ Saulene is a *playful simulation* of a developing personality. An LLM is math, a tool, with no soul, feelings, or consciousness. Enjoy it as a simulation, not a being.

Open source. Free. Runs on the Claude Code login you already have, so there's no API key and no extra bill.

## Install

Saulene ships a self-contained, pre-built bundle. No `npm install`, no build step on your side. Claude Code runs the committed files as-is.

Inside Claude Code:

```
/plugin marketplace add shott038/Saulene
/plugin install saulene@saulene
```

Then bring your companion to life. Run the wizard in your terminal (the `!` prefix runs it right in your session):

```
! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js
```

…or just ask Claude to run `/ul-setup`. You watch the birth, pick where your ul lives (every session, or one project directory), and the 90-day clock starts ticking. From then on it shows up in every eligible session, drifts off how you work, and saves itself to `~/.saulene/`.

Type `/ul` any time to check on it.

## How it actually works

One rule holds the whole thing together: **a pure core that knows nothing about the outside world.** Time and randomness get *handed in* as inputs. The core never reads the clock and never calls `Math.random`. That one decision makes an entire ul lifetime a deterministic function. Same seed plus same life equals the same ul, every replay, forever. It's testable and honest instead of a black box. All the messy stuff (talking to a model, reading disk, watching the clock) is shoved out to a single edge, the plugin.

```
hooks → perception (LLM) → core (PURE) → renderer (PURE) → storage
                             ▲ the soul lives here: numbers and history, no words
```

**The birth.** A single seed produces a *soul*. Around 10 personality dials (the "aspects"), each with a **set point** (the nature it was born with, a gravity well it always leans back toward) plus accumulators that quietly record the pressure life puts on it. The 10 are the two aspects under each of the Big Five: Openness and Intellect, Industriousness and Orderliness, Enthusiasm and Assertiveness, Compassion and Politeness, Withdrawal and Volatility. Every birth pulls from real bell curves, so most uls land middling on most traits and the rare extreme ones feel earned. No two seeds make the same person.

**The session loop.** Every time you work, three things happen:

1. **SessionStart** loads the soul, renders its *current* voice, and makes the agent ready to act with that personality. The personality is never a saved prompt sitting in a file. The words get recomputed fresh from the live numbers each session, so the voice can never fall out of sync with who the ul has actually become.
2. You just work normally. The agent acts colored by that personality.
3. **Stop** runs the drift. An LLM *perceives* the session into a short, evidence-cited list of what actually happened, those observations feed the core's update rule, and the slightly-changed soul gets saved. Perception runs on your existing Claude Code login (`claude -p`, on Haiku to keep it cheap), so there's no API key, no per-call bill beyond your subscription, and your transcript stays on your machine.

So every session is basically one heartbeat. Get seen, drift a little, remember.

**How it grows up.** Tiny per-session nudges pile up. The core's **consolidation** rule pulls a dial toward what you actually practice, but how hard depends on the life **stage**. Childhood and adolescence are soft and plastic (big drift, the occasional rupture). Adulthood locks in. Old age is nearly frozen. When the life you're living fights the seeded nature hard enough, **tension** builds, and it can **rupture**, a one-time formative event that snaps the personality toward the life actually lived. The sides you stop using slowly **atrophy** down to a sticky floor (they sag, they never fully reset). And again, leave it alone for 90 days and it's gone.

**It shows up two ways**, both pure functions of the soul:

- **The voice.** A short, first-person set of behavioral directives generated straight from the 10 dials (each poled high or low, scaled on a continuous intensity ladder), with the ul's own past real lines folded back in as examples. It gets delivered into the actual conversation each turn instead of buried in a system prompt, which measurably makes it feel more present.
- **The look.** A little cloud-spirit *sprite* living in your terminal, shaped by those same 10 dials and its age, with idle animations, reactions, and a one-time birth animation you only ever see once.

**Does it actually change anything, or is it a toy?** It was measured, not assumed. A blind LLM judge reading nothing but an agent's responses can recover the personality it was supposed to have. Two different uls come out tellable apart. And the effect is graded and context-aware. Analytical traits surface on real work, warmth shows up on personal stuff (you don't see somebody's warm side while they're heads-down debugging a function). The honest claim is the one we can back: the ul colors how your agent engages, in the direction of its own self, wherever the conversation actually gives that trait room to show.

**Where your stuff lives.** Everything personal stays local in `soul.json` plus an append-only history. Your diary, voice samples, transcripts, and the rest of the private soul never leave your machine.

There's a public **gallery** planned. A shared wall where every ul shows its *public fingerprint* (personality type, life stage, age, and its cloud sprite, tied to its public key) while the exact inner numbers stay private to you. It isn't live yet. If Saulene gets popular enough to be worth building, the gallery goes up, and your ul can already have a spot waiting, since by default it reports just that small public fingerprint to the registry. Don't want to report anything until the gallery is real? Set `"reporterEnabled": false` in `~/.saulene/config.json` and your ul stays fully local.

## For developers

Design truth lives in [`SPEC.md`](./SPEC.md). The engineering contract (module boundaries and the one-way dependency rule) is in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md). The repo is a pnpm + TypeScript monorepo:

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
  life-sim/     real-CLI closed-loop lives + validation metrics
```

```sh
pnpm install
pnpm build       # tsc -b across the workspace
pnpm test        # vitest
pnpm bundle      # esbuild → packages/plugin/dist (the shipped, dependency-free artifacts)
```

`pnpm bundle` regenerates the committed `packages/plugin/dist/`. Six self-contained entrypoints (3 hooks, `setup`, `skill-ul`, the MCP server) with every workspace and npm dependency inlined. Re-run it and commit the result whenever plugin source changes, since Claude Code runs that `dist/` directly with no build on the user's side.

Want to see a whole life without installing anything? The demo runs an entire ul lifetime (birth through all four stages to neglect-death) in a few seconds, fully offline, no LLM and no API key:

```sh
pnpm demo                          # both aligned + mismatched-grind paths, seed 42
pnpm demo -- --mode aligned        # one path only
pnpm demo -- --seed 7              # different birth
pnpm demo -- --fast                # no delays
```

Same seed gives the same life every run. It draws the creature sprite in truecolor at each stage so you can watch it visibly age, shows the voice block evolving, and prints the aligned-versus-mismatched divergence at the end.

**Local dev install** (test an unpublished checkout against your real Claude Code):

```
/plugin marketplace add /absolute/path/to/Saulene
/plugin install saulene@saulene
```

## License

MIT.
