---
description: Show your ul companion — type (MBTI), life stage, age, a qualitative drift note, and the neglect countdown. Use when the user asks to see their ul, companion, personality, or "show ul". (Raw trait numbers are private — viewable only on the gallery after unlock.)
---

Run the following command and display its output to the user:

```bash
node ${CLAUDE_PLUGIN_ROOT}/dist/bin/skill-ul.js
```

If the command produces no output, tell the user: "You don't have an ul yet. Run `/ul-setup` to create your companion, or run `! node ${CLAUDE_PLUGIN_ROOT}/dist/bin/setup.js` directly in your terminal."
