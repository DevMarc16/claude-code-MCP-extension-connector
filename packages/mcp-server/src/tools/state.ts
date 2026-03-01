import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

export function registerStateTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool('get_cookies', 'Get cookies for a tab or URL', {
    tabId: z.number().optional().describe('Tab ID'),
    url: z.string().optional().describe('URL to get cookies for')
  }, async ({ tabId, url }) => {
    const res = await bridge.send('get_cookies', { tabId, url });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('get_local_storage', 'Read localStorage from a tab', {
    tabId: z.number().optional().describe('Tab ID'),
    key: z.string().optional().describe('Specific key. If omitted, returns all.')
  }, async ({ tabId, key }) => {
    const res = await bridge.send('get_local_storage', { tabId, key });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('get_session_storage', 'Read sessionStorage from a tab', {
    tabId: z.number().optional().describe('Tab ID'),
    key: z.string().optional().describe('Specific key. If omitted, returns all.')
  }, async ({ tabId, key }) => {
    const res = await bridge.send('get_session_storage', { tabId, key });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });
}
