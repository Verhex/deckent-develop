#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DECKENT_VERSION } from '../core/constants.js';
import { registerTools } from './tools/index.js';
import { registerResources } from './resources/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'deckent',
    version: DECKENT_VERSION,
  });

  registerTools(server);
  registerResources(server);

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`deckent-mcp error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
