/**
 * @saulene/plugin — public surface (the composition root)
 *
 * THE ONLY IO EDGE. Wires the pure pieces (core/renderer) and near-pure pieces
 * (perception/storage) to the dirty edges: the real LLM client, real entropy, real
 * clock, real filesystem. If it touches the outside world, it lives here — nowhere else.
 */

export * from "./hooks/index.js";
export * from "./mcp/index.js";
export * from "./setup/index.js";
export * from "./skill/index.js";
export * from "./statusline/index.js";
