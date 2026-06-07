/**
 * @saulene/plugin — /ul skill CLI entry
 *
 * Prints the formatted ul snapshot to stdout as markdown. Returns exit 0 with no
 * output when no ul exists yet (not born). Claude Code displays whatever is printed.
 */

import { ulText } from "../skill/index.js";

const text = ulText();
if (text) {
  process.stdout.write(`${text}\n`);
}
