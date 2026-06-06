/**
 * @saulene/renderer — public surface
 *
 * Expression has two surfaces, both pure versioned functions of soul state:
 *   - `state → injection text` (layers) — the SessionStart voice. Golden-file tested,
 *     re-skinnable (MBTI → Enneagram) without touching the engine.
 *   - `state → look` (sprite) — the ul's creature form rendered in the gallery.
 */

export * from "./layers/index.js";
export * from "./fingerprint/index.js";
export * from "./sprite/index.js";
