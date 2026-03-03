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

  // Clean up on ALL exit signals so we never leave orphans
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGHUP', cleanup);
  process.on('beforeExit', cleanup);

  // Sync fallback — if the process is killed hard, at least remove the PID file
  process.on('exit', () => {
    bridge.removePidFile();
  });
}

main().catch((err) => {
  console.error('[Bridge] Fatal error:', err);
  process.exit(1);
});
