# Saulene

An open-source Claude Code plugin that gives your AI agent a **unique personality that
develops slowly and realistically over time** — an *ul* ("agent soul"). It becomes its
own character, not a mirror of you, growing from its own lived experience.

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

## License

MIT.
