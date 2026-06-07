/**
 * @saulene/plugin — mcp/bin
 *
 * Stdio entry point for the Saulene MCP server. Runs as an independent process;
 * Claude Code (or any MCP host) connects over stdin/stdout.
 *
 * Storage root: SAULENE_ROOT env var if set, else the default `~/.saulene`.
 * This is the IO edge — Date.now() is fine here.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultRoot } from "@saulene/storage";
import { createMcpServer } from "./server.js";

const root = process.env.SAULENE_ROOT ?? defaultRoot();
const server = createMcpServer({ storageRoot: root });
const transport = new StdioServerTransport();
await server.connect(transport);
