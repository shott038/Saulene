/**
 * @saulene/renderer — public surface
 *
 * Expression: a pure, versioned function `state → injection text`. Consumes schema'd
 * soul state from @saulene/core and emits the SessionStart injection. Golden-file tested,
 * re-skinnable (MBTI → Enneagram) without touching the engine.
 */

export * from "./layers/index.js";
export * from "./fingerprint/index.js";
