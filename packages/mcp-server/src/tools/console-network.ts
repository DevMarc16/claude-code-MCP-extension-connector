import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

export function registerConsoleNetworkTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool('get_console_logs', 'Get captured console output. Start monitoring first with monitor_console.', {
    tabId: z.number().optional().describe('Tab ID'),
    level: z.enum(['all', 'log', 'warn', 'error', 'info', 'debug']).optional().describe('Filter by level')
  }, async ({ tabId, level }) => {
    const res = await bridge.send('get_console_logs', { tabId, level: level ?? 'all' });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('get_network_requests', 'Get captured network requests. Start monitoring first with monitor_network.', {
    tabId: z.number().optional().describe('Tab ID'),
    urlFilter: z.string().optional().describe('Filter by URL substring'),
    methodFilter: z.string().optional().describe('Filter by HTTP method')
  }, async ({ tabId, urlFilter, methodFilter }) => {
    const res = await bridge.send('get_network_requests', { tabId, urlFilter, methodFilter });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('clear_console', 'Clear captured console logs', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('clear_console', { tabId });
    return { content: [{ type: 'text', text: res.success ? 'Console logs cleared.' : `Error: ${res.error}` }] };
  });

  server.tool('get_page_errors', 'Get all JavaScript errors on the page', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('get_page_errors', { tabId });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('monitor_console', 'Start or stop console monitoring', {
    tabId: z.number().optional().describe('Tab ID'),
    enable: z.boolean().describe('true=start, false=stop')
  }, async ({ tabId, enable }) => {
    const res = await bridge.send('monitor_console', { tabId, enable });
    return { content: [{ type: 'text', text: res.success ? `Console monitoring ${enable ? 'started' : 'stopped'}.` : `Error: ${res.error}` }] };
  });

  server.tool('monitor_network', 'Start or stop network request monitoring', {
    tabId: z.number().optional().describe('Tab ID'),
    enable: z.boolean().describe('true=start, false=stop')
  }, async ({ tabId, enable }) => {
    const res = await bridge.send('monitor_network', { tabId, enable });
    return { content: [{ type: 'text', text: res.success ? `Network monitoring ${enable ? 'started' : 'stopped'}.` : `Error: ${res.error}` }] };
  });
}
