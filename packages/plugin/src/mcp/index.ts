/**
 * @saulene/plugin — mcp
 *
 * The MCP core: the soul's state + identity tools — the portable, standard-shaped box.
 * Extractable so other hosts can connect the bare MCP (degraded, manual: no hooks).
 * Holds/serves data; it does NOT run the life (hooks do).
 *
 * Public surface:
 *   snapshot()         — shared pure reader (storage → computed UlSnapshot)
 *   createMcpServer()  — factory for the stdio MCP server
 *
 * The stdio entry point lives at mcp/bin.ts (not exported here — it's a process, not a lib).
 */

export type { UlSnapshot, SnapshotOpts } from "./snapshot.js";
export { snapshot } from "./snapshot.js";

export type { McpServerOpts } from "./server.js";
export { createMcpServer } from "./server.js";
