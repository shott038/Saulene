/**
 * @saulene/plugin — animation director (runtime engine)
 *
 * Promoted from the demo-only director in scripts/ul-idle.mjs (--export-session) to
 * the runtime engine driven by real Claude Code session signals. Manages all animation
 * state: the idle heartbeat, reactive events, and the conflict-resolution layer.
 *
 * Conflict-resolution rules (from NOTES.md):
 *   MODES (sustained, exactly one active): compaction > filling > thinking > ctxHigh > idle
 *   PULSES (one-shot, preempt by priority): error > success > prompt > retry > response
 *   (1) compaction is EXCLUSIVE — suspends idle loop, pulses, gestures, and swap until done.
 *   (2) One mode at a time; filling beats thinking while context climbs; reverts after.
 *   (3) Pulses preempt by priority; play to completion; then hand back to the active mode.
 *   (4) Idle gestures + the 2:15 variant swap only run at rest (idle / >80% rest).
 *   (5) ctxHigh governs only the resting body — transient states use their own body.
 */

import type { SpriteParams } from "@saulene/renderer";
import type { OverlayFlags } from "./rasterizer.js";
import {
  COMPACTION_SCAN,
  COMPACTION_TICKS,
  ERROR_FRAMES,
  GESTURE_NAMES,
  GESTURES,
  SWAP_TICKS,
  TWINKLE_CHANCE,
  TWINKLE_LEN,
  WISP_EXTRA,
  WISP_ORIGINAL,
  WISP_POOL,
  WISP_TWINKLE,
  WISP_VARIANTS,
  breatheDy,
} from "./sprite-data.js";

// ── Public types ───────────────────────────────────────────────────────────────

/** Events the director accepts from real Claude Code hook signals. */
export type DirectorEvent =
  | "prompt"        // UserPromptSubmit: user hits enter
  | "thinking"      // PreToolUse / generation start: Claude is working
  | "thinking-end"  // thinking finished (superseded by success/error pulses)
  | "filling"       // context window actively receiving a large chunk
  | "filling-end"   // intake done → revert to previous mode
  | "success"       // PostToolUse success: a big win
  | "error"         // PostToolUse error
  | "retry"         // tool retry attempt
  | "response"      // response text finished streaming
  | "compaction"    // context compaction started (exclusive mode)
  | "compaction-end"// compaction done early (optional; auto-expires via ticks)
  | "ctx-high"      // context window > 80% full
  | "ctx-normal";   // context back to normal

/** The frame output: what to render this tick. */
export interface AnimFrame {
  /** Active wisp cells ([row, col] pixel coords). */
  wispCells: readonly [number, number][];
  /** Animation overlay for compose(). */
  overlay: OverlayFlags;
  /** Body vertical offset (breathing + prompt hop). */
  dy: number;
}

// ── Internal types ────────────────────────────────────────────────────────────

type ModeName = "idle" | "thinking" | "filling" | "compaction";
type PulseName = "prompt" | "success" | "error" | "retry" | "response";

interface PulseSpec {
  frames: Array<{ overlay: OverlayFlags; dy: number }>;
}

const PULSE_PRIORITY: Record<PulseName, number> = {
  error: 5, success: 4, prompt: 3, retry: 2, response: 1,
};

// ── Pulse frame sequences ─────────────────────────────────────────────────────

const PULSES: Record<PulseName, PulseSpec> = {
  prompt: {
    frames: [
      { overlay: { wdy: 1 }, dy: -1 },
      { overlay: { wdy: 1 }, dy: -1 },
    ],
  },
  success: {
    frames: Array.from({ length: 14 }, () => ({ overlay: { success: 1 as const }, dy: -1 })),
  },
  error: {
    frames: ERROR_FRAMES.map((f) => ({
      overlay: { dx: f.dx, noWisps: 1 as const },
      dy: 0,
    })),
  },
  retry: {
    frames: Array.from({ length: 5 }, () => ({ overlay: { noWisps: 1 as const }, dy: 0 })),
  },
  response: {
    frames: Array.from({ length: 9 }, () => ({ overlay: { win: -1 }, dy: 0 })),
  },
};

// ── AnimDirector ──────────────────────────────────────────────────────────────

/**
 * The runtime animation director. Tick-driven at TICK_MS (80ms) intervals.
 *
 * Usage:
 *   const director = new AnimDirector(spriteParams);
 *   director.signal("thinking");
 *   const frame = director.tick();  // call at 80ms intervals
 */
export class AnimDirector {
  private mode: ModeName = "idle";
  private ctxHigh = false;

  // compaction state
  private compTicks = 0;
  private compScanIdx = 0;

  // pulse state
  private pulse: PulseName | null = null;
  private pulseFrameIdx = 0;

  // gesture state (idle only)
  private gesture: string | null = null;
  private gestureFrameIdx = 0;
  private gestureCooldown = 30;

  // wisp variant state
  private variantIdx = 0;
  private ticksSinceSwap = 0;
  private twinkleTicks = 0;

  // global tick counter (for breathing)
  private tickCount = 0;

  // whether the extra-enthusiasm wisps are active (wispCount=6)
  private extraWisps: boolean;

  constructor(params: SpriteParams) {
    this.extraWisps = params.wispCount === 6;
  }

  /**
   * Update the director's extra-wisp setting when the soul changes.
   * Call this if the soul is reloaded mid-session.
   */
  updateParams(params: SpriteParams): void {
    this.extraWisps = params.wispCount === 6;
  }

  /** Receive a session event and update mode/pulse accordingly. */
  signal(event: DirectorEvent): void {
    switch (event) {
      case "prompt":
        this._firePulse("prompt");
        break;
      case "thinking":
        if (this.mode !== "compaction" && this.mode !== "filling") {
          this.mode = "thinking";
        }
        break;
      case "thinking-end":
        if (this.mode === "thinking") this.mode = "idle";
        break;
      case "filling":
        if (this.mode !== "compaction") this.mode = "filling";
        break;
      case "filling-end":
        if (this.mode === "filling") {
          this.mode = this._hadThinking ? "thinking" : "idle";
        }
        break;
      case "success":
        if (this.mode === "thinking") this.mode = "idle";
        this._firePulse("success");
        break;
      case "error":
        this._firePulse("error");
        break;
      case "retry":
        this._firePulse("retry");
        break;
      case "response":
        this._firePulse("response");
        break;
      case "compaction":
        this.mode = "compaction";
        this.compTicks = COMPACTION_TICKS;
        this.compScanIdx = 0;
        this.pulse = null;
        this.gesture = null;
        break;
      case "compaction-end":
        if (this.mode === "compaction") {
          this.mode = "idle";
          this.compTicks = 0;
        }
        break;
      case "ctx-high":
        this.ctxHigh = true;
        break;
      case "ctx-normal":
        this.ctxHigh = false;
        break;
    }
  }

  // Track whether thinking mode was active when filling started (to revert correctly)
  private _hadThinking = false;

  /** Advance the animation by one tick (call at TICK_MS = 80ms intervals). */
  tick(): AnimFrame {
    const t = this.tickCount++;

    // ── Compaction: exclusive mode ──────────────────────────────────────────
    if (this.mode === "compaction") {
      if (this.compTicks > 0) {
        const eye: number = COMPACTION_SCAN[this.compScanIdx % COMPACTION_SCAN.length] ?? 0;
        this.compScanIdx++;
        this.compTicks--;
        if (this.compTicks === 0) this.mode = "idle";
        return { wispCells: [], overlay: { eyeDy: 1, eye }, dy: 0 };
      }
      this.mode = "idle";
    }

    const baseWisps = this._activeWisps();

    // ── Pulse: one-shot, preempts by priority ───────────────────────────────
    if (this.pulse) {
      const spec = PULSES[this.pulse];
      if (spec) {
        const f = spec.frames[this.pulseFrameIdx++];
        if (f) {
          const isNoWisps = !!(f.overlay as { noWisps?: 1 }).noWisps;
          const wispCells = isNoWisps ? [] : baseWisps;
          if (this.pulseFrameIdx >= spec.frames.length) {
            this.pulse = null;
            this.gestureCooldown = 22; // brief pause after pulse
          }
          return { wispCells, overlay: f.overlay, dy: f.dy };
        }
        // ran off end of frames
        this.pulse = null;
        this.gestureCooldown = 22;
      }
    }

    // ── Filling mode ────────────────────────────────────────────────────────
    if (this.mode === "filling") {
      return { wispCells: baseWisps, overlay: { blink: 1, open: 2 }, dy: 1 };
    }

    // ── Thinking mode ───────────────────────────────────────────────────────
    if (this.mode === "thinking") {
      return { wispCells: baseWisps, overlay: { win: 5 }, dy: 0 };
    }

    // ── Idle (+ ctxHigh rest) ───────────────────────────────────────────────
    // Variant swap + twinkle (only at rest, not when ctxHigh swap is locked)
    if (!this.ctxHigh) {
      this.ticksSinceSwap++;
      if (this.ticksSinceSwap >= SWAP_TICKS && this.twinkleTicks <= 0) {
        this.ticksSinceSwap = 0;
        if (Math.random() < TWINKLE_CHANCE) {
          this.twinkleTicks = TWINKLE_LEN;
        } else {
          this.variantIdx = WISP_POOL[Math.floor(Math.random() * WISP_POOL.length)] ?? 0;
        }
      }
    }

    // Twinkle easter egg
    if (this.twinkleTicks > 0) {
      const cells = this.twinkleTicks-- % 2 === 0 ? WISP_TWINKLE : [];
      return { wispCells: cells, overlay: {}, dy: breatheDy(t) };
    }

    // Gestures
    let gestureOverlay: OverlayFlags = {};
    if (this.gesture) {
      const frames = GESTURES[this.gesture];
      if (frames) {
        const gf = frames[this.gestureFrameIdx++];
        if (gf) {
          const o: OverlayFlags = {};
          if (gf.dx !== undefined) o.dx = gf.dx;
          if (gf.blink !== undefined) o.blink = gf.blink;
          if (gf.eye !== undefined) o.eye = gf.eye;
          gestureOverlay = o;
        }
        if (this.gestureFrameIdx >= frames.length) {
          this.gesture = null;
          this.gestureCooldown = 24;
        }
      }
    } else if (--this.gestureCooldown <= 0) {
      this.gesture = GESTURE_NAMES[t % GESTURE_NAMES.length] ?? "blink";
      this.gestureFrameIdx = 0;
    }

    const overlay: OverlayFlags = this.ctxHigh ? { ...gestureOverlay, ctx: 1 } : gestureOverlay;
    return { wispCells: this._activeWisps(), overlay, dy: breatheDy(t) };
  }

  /** Current wisp variant cells, plus extra wisps if enthusiasm is high. */
  private _activeWisps(): readonly [number, number][] {
    const variant = WISP_VARIANTS[this.variantIdx];
    const base: [number, number][] = variant ? [...variant.cells] : [...WISP_ORIGINAL];
    if (this.extraWisps) {
      base.push(...WISP_EXTRA);
    }
    return base;
  }

  /** Fire a pulse, respecting priority (higher priority preempts a running lower pulse). */
  private _firePulse(name: PulseName): void {
    if (this.mode === "compaction") return; // compaction blocks all pulses
    if (this.pulse && PULSE_PRIORITY[name] <= PULSE_PRIORITY[this.pulse]) return;
    this.pulse = name;
    this.pulseFrameIdx = 0;
  }

  /** Read-only state for diagnostics (tests). */
  get state(): {
    mode: ModeName;
    ctxHigh: boolean;
    pulse: PulseName | null;
    variantKey: string;
    compTicks: number;
  } {
    return {
      mode: this.mode,
      ctxHigh: this.ctxHigh,
      pulse: this.pulse,
      variantKey: WISP_VARIANTS[this.variantIdx]?.key ?? "original",
      compTicks: this.compTicks,
    };
  }
}
