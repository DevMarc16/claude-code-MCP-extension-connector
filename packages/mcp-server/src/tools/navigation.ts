import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

export function registerNavigationTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool(
    'list_tabs',
    'List all open browser tabs with their titles, URLs, and IDs',
    {},
    async () => {
      const res = await bridge.send('list_tabs');
      return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
    }
  );

  server.tool(
    'get_active_tab',
    'Get information about the currently active browser tab',
    {},
    async () => {
      const res = await bridge.send('get_active_tab');
      return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
    }
  );

  server.tool(
    'navigate',
    'Navigate a browser tab to a specified URL',
    { tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.'), url: z.string().describe('URL to navigate to') },
    async ({ tabId, url }) => {
      const res = await bridge.send('navigate', { tabId, url });
      return { content: [{ type: 'text', text: res.success ? `Navigated to ${url}` : `Error: ${res.error}` }] };
    }
  );

  server.tool(
    'open_tab',
    'Open a new browser tab, optionally with a URL',
    { url: z.string().optional().describe('URL to open') },
    async ({ url }) => {
      const res = await bridge.send('open_tab', { url });
      return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
    }
  );

  server.tool(
    'close_tab',
    'Close a browser tab by ID',
    { tabId: z.number().describe('Tab ID to close') },
    async ({ tabId }) => {
      const res = await bridge.send('close_tab', { tabId });
      return { content: [{ type: 'text', text: res.success ? `Tab ${tabId} closed.` : `Error: ${res.error}` }] };
    }
  );

  server.tool(
    'reload_tab',
    'Reload a browser tab, optionally bypassing cache',
    { tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.'), bypassCache: z.boolean().optional().describe('Bypass browser cache') },
    async ({ tabId, bypassCache }) => {
      const res = await bridge.send('reload_tab', { tabId, bypassCache });
      return { content: [{ type: 'text', text: res.success ? 'Tab reloaded.' : `Error: ${res.error}` }] };
    }
  );
}
