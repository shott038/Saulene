#!/usr/bin/env node
/**
 * ul-sprite.mjs — print the ul terminal sprite to a real terminal (truecolor needed).
 *
 *   node scripts/ul-sprite.mjs              # all state frames, sky palette
 *   node scripts/ul-sprite.mjs ember stress # one palette + state
 *
 * This is the same rasterizer a Saulene statusline command would call, picking a frame
 * from session state (e.g. context% → stress) + a time-based blink.
 */
import { PALS, rasterize, toAnsi } from "./ul-terminal.mjs";

const [, , palArg, stateArg] = process.argv;
const pal = PALS[palArg] ?? PALS.sky;
const states = stateArg ? [stateArg] : ["idle", "blink", "success", "stress"];

for (const s of states) {
  process.stdout.write(`\n  \x1b[2m${s}\x1b[0m\n`);
  process.stdout.write(toAnsi(rasterize(s, pal, 30), "  "));
}
process.stdout.write("\n");
