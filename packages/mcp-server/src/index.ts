#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BridgeWebSocket } from './websocket.js';
import { createServer } from './server.js';

async function main() {
  const bridge = new BridgeWebSocket();
  await bridge.start();

  const server = createServer(bridge);
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Bridge] MCP server running on stdio');

  process.on('SIGINT', async () => {
    await bridge.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Bridge] Fatal error:', err);
  process.exit(1);
});
