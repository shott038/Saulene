/**
 * @saulene/plugin — mcp/server
 *
 * Factory for the Saulene MCP server. Exposes three read-only identity tools:
 *
 *   ul_snapshot   — full soul state: aspects (0-100), set points, tension, stage, age,
 *                   MBTI, sex, stubbornness, neglect-death countdown, recent drift rows.
 *   ul_drift      — recent ledger history (aspect observations from past sessions),
 *                   N rows configurable per-call.
 *   ul_countdown  — focused neglect-death countdown (days remaining, isDead flag).
 *
 * All tools are READ-ONLY — no soul mutation here. Drift happens exclusively in the Stop hook.
 * `storageRoot` and `now` are injected so tests use no real IO or clock.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { snapshot } from "./snapshot.js";

export interface McpServerOpts {
  storageRoot?: string;
  /** Unix timestamp (ms) for countdown computation. Defaults to Date.now() at call time. */
  now?: number;
}

/** Create and return a configured (but not yet connected) Saulene MCP server. */
export function createMcpServer(opts: McpServerOpts = {}): Server {
  const server = new Server(
    { name: "saulene-ul", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "ul_snapshot",
        description:
          "Full identity snapshot of the ul: current 10 Big Five aspects (0–100 scale), innate set points (nature), tension per aspect, life stage, maturity age, MBTI readout, sex, stubbornness, neglect-death countdown, and recent ledger drift rows. Returns null when no ul exists yet (not born).",
        inputSchema: {
          type: "object",
          properties: {
            driftRows: {
              type: "number",
              description: "How many recent ledger rows to include (default: 20).",
            },
          },
        },
      },
      {
        name: "ul_drift",
        description:
          "Recent session ledger history — per-aspect observations (practice, fit, confidence, evidence) from the ul's past sessions. Newest rows first.",
        inputSchema: {
          type: "object",
          properties: {
            rows: {
              type: "number",
              description: "How many rows to return (default: 20, max: 100).",
            },
          },
        },
      },
      {
        name: "ul_countdown",
        description:
          "Neglect-death countdown: how many days until the ul dies from non-use (90-day flat clock). Returns daysUntilDeath (negative = already dead), isDead flag, and lastUsedAt epoch-ms.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const now = opts.now ?? Date.now();
    const tool = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    // Build the injected opts, omitting storageRoot if not provided (exactOptionalPropertyTypes).
    const snapBase =
      opts.storageRoot !== undefined ? { storageRoot: opts.storageRoot, now } : { now };

    if (tool === "ul_snapshot") {
      const driftRows =
        typeof args.driftRows === "number" ? Math.min(100, Math.max(0, args.driftRows)) : 20;
      const snap = snapshot({ ...snapBase, driftRows });
      return {
        content: [
          {
            type: "text",
            text: snap === null ? "null" : JSON.stringify(snap, null, 2),
          },
        ],
      };
    }

    if (tool === "ul_drift") {
      const rows = typeof args.rows === "number" ? Math.min(100, Math.max(0, args.rows)) : 20;
      const snap = snapshot({ ...snapBase, driftRows: rows });
      if (snap === null) {
        return { content: [{ type: "text", text: "null" }] };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(snap.recentDrift, null, 2),
          },
        ],
      };
    }

    if (tool === "ul_countdown") {
      const snap = snapshot({ ...snapBase, driftRows: 0 });
      if (snap === null) {
        return { content: [{ type: "text", text: "null" }] };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                daysUntilDeath: snap.daysUntilDeath,
                isDead: snap.isDead,
                lastUsedAt: snap.lastUsedAt,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${tool}`);
  });

  return server;
}
