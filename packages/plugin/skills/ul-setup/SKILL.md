---
description: Create your ul companion — run the interactive first-run setup wizard. Use when the user asks to set up Saulene, create their ul, run setup, or is told there is no ul yet.
---

Your ul needs to be created by running an interactive terminal program. Tell the user to run this command in their terminal (using the `!` prefix to run it in-session):

```
! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js
```

The wizard will:
1. Show a mandatory reality-warning acknowledgement
2. Play the birth animation (watch-only — their ul springs into existence) + generate its keypair
3. Ask where their ul should live (global sessions or one specific directory)
4. Disclose the public gallery (on by default; press `o` to opt out)

Once setup completes their ul is alive and will appear in every eligible session.
