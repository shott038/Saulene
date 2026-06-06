/**
 * @saulene/plugin — StatusLine runtime
 *
 * The live terminal ul: a self-contained class that runs the animation director +
 * rasterizer at TICK_MS (80ms) intervals, writing ANSI truecolor half-blocks to
 * the terminal. Session events are pushed in via `signal()`.
 *
 * IO EDGE: the only file in this module that touches real timers or writes to the
 * terminal. Everything else (sprite-data, rasterizer, director, birth) is pure or
 * near-pure and independently testable.
 */

import type { SpriteParams } from "@saulene/renderer";
import { AnimDirector } from "./director.js";
import type { DirectorEvent } from "./director.js";
import { CHAR_ROWS, colorsFromParams, compose, pixelGridToAnsi } from "./rasterizer.js";
import { TICK_MS } from "./sprite-data.js";

export type { DirectorEvent } from "./director.js";

export interface StatusLineOpts {
  /** Terminal color mode. Defaults to "dark". */
  mode?: "dark" | "light";
  /** Indent string prepended to each terminal row (e.g. a status-bar prefix). */
  indent?: string;
  /** Write function. Defaults to process.stdout.write. */
  write?: (s: string) => void;
}

/**
 * The live terminal ul.
 *
 * Lifecycle:
 *   const sl = new StatusLine(spriteParams, opts);
 *   sl.start();              // start the animation loop
 *   sl.signal("thinking");   // push session events
 *   sl.stop();               // stop the loop (e.g., on session end)
 */
export class StatusLine {
  private readonly director: AnimDirector;
  private readonly mode: "dark" | "light";
  private readonly indent: string;
  private readonly write: (s: string) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private first = true;
  private params: SpriteParams;

  constructor(params: SpriteParams, opts: StatusLineOpts = {}) {
    this.params = params;
    this.mode = opts.mode ?? "dark";
    this.indent = opts.indent ?? "";
    this.write = opts.write ?? ((s) => process.stdout.write(s));
    this.director = new AnimDirector(params);
  }

  /** Update sprite params (e.g., if soul changes between sessions). */
  updateParams(params: SpriteParams): void {
    this.params = params;
    this.director.updateParams(params);
  }

  /** Push a session event to the director. Thread-safe (single-threaded Node.js). */
  signal(event: DirectorEvent): void {
    this.director.signal(event);
  }

  /** Start the 80ms animation loop (hides the cursor). */
  start(): void {
    if (this.timer) return;
    this.write("\x1b[?25l"); // hide cursor
    this.first = true;
    this.timer = setInterval(() => this._tick(), TICK_MS);
    this.timer.unref?.(); // don't keep the process alive just for the animation
  }

  /** Stop the animation loop (restores the cursor). */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.write("\x1b[?25h"); // restore cursor
    this.write("\n");
  }

  /** Whether the animation loop is running. */
  get running(): boolean {
    return this.timer !== null;
  }

  // ── Internal tick ────────────────────────────────────────────────────────────

  private _tick(): void {
    const { wispCells, overlay, dy } = this.director.tick();
    const colors = colorsFromParams(this.params, this.mode);
    const grid = compose(colors, wispCells, overlay, dy);
    const ansi = pixelGridToAnsi(grid, this.indent);

    if (!this.first) {
      this.write(`\x1b[${CHAR_ROWS}A`); // move cursor up to overwrite previous frame
    }
    this.first = false;
    this.write(ansi);
  }
}
