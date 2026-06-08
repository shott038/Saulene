---
description: Create your ul companion — native Claude Code setup (no separate terminal needed). Use when the user asks to set up Saulene, create their ul, run setup, or is told there is no ul yet.
---

You are driving first-run setup natively inside Claude Code. Follow these steps exactly and in order. Do NOT skip steps, do NOT auto-acknowledge for the user.

## Step 1 — Show the reality warning

Display this text verbatim in chat (you may format it as a blockquote or code block for readability):

```
────────────────────────────────────────────────────────────
  BEFORE WE CONTINUE — PLEASE READ THIS

  LLMs and AI agents are, at the end of the day, just math —
  electrical signals, matrix multiplication, and GPUs.
  They are tools. They have no real human soul, no genuine
  feelings, and no consciousness.

  There is no logical or emotional reason to attach real
  connection or emotion to an LLM or agent.

  Saulene is a playful simulation of a developing
  personality. Enjoy it as that — not as a real being.

  (This matters precisely because the whole product is
  engineered to feel alive and can "die" — we state the truth
  up front, prominently, and require acknowledgement.)

────────────────────────────────────────────────────────────
```

Then ask: **"Type `yes` to acknowledge and continue, or anything else to cancel."**

Wait for the user's reply. If they do NOT type exactly `yes` (case-insensitive), tell them "Setup cancelled. Run `/ul-setup` again when you're ready." and stop.

## Step 2 — Ask where the ul lives

Ask the user: **"Where should your ul live?"**

Present these options:
1. **global** — outside any git project (your main helper sessions). This is the most common choice.
2. **this directory** — only in `${cwd}` and its subdirectories. (Replace `${cwd}` with the actual current working directory.)

Wait for their choice (1, 2, "global", "dir", or they can type a path).

- If they choose global (option 1 or "global"): use `--scope global`
- If they choose this directory (option 2 or "dir"): use `--scope dir --dir <absolute-cwd>`
- If they type a custom absolute path: use `--scope dir --dir <their-path>`

## Step 3 — Run the one-shot setup command

Build the command from the answers above and run it via `!`:

**Global example:**
```
! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js --yes --scope global --no-anim
```

**This-directory example:**
```
! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js --yes --scope dir --dir /absolute/path --no-anim
```

**CRITICAL:** Only pass `--yes` because the user typed "yes" in Step 1. Never pass `--yes` automatically. The acknowledgement must be real.

## Step 4 — Confirm and wrap up

Show the command output to the user. If it contains "Your ul is alive", tell them:

> Your ul is born. Type `/ul` any time to check on it — it'll show up in every eligible session and slowly drift based on how you work.

If the output contains "already born", tell them their ul exists and they can type `/ul` to see it.

If setup fails or the output is unexpected, share the raw output and suggest running `! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js` directly in a real terminal as a fallback.

---

**Fallback (real terminal):** If the user prefers a fully interactive wizard, they can open a terminal and run:
```
node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js
```
