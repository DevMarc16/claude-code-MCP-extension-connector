import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

export function registerDevTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool('get_accessibility_report', 'Run accessibility audit, report WCAG violations', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('get_accessibility_report', { tabId }, 60000);
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('get_performance_metrics', 'Get page performance: load time, LCP, CLS, memory', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('get_performance_metrics', { tabId });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('emulate_device', 'Emulate mobile device viewport and user agent', {
    tabId: z.number().optional().describe('Tab ID'),
    device: z.enum(['iphone-14', 'iphone-se', 'pixel-7', 'ipad', 'ipad-pro', 'reset']).describe('Device or "reset"')
  }, async ({ tabId, device }) => {
    const res = await bridge.send('emulate_device', { tabId, device });
    return { content: [{ type: 'text', text: res.success ? `Emulating: ${device}` : `Error: ${res.error}` }] };
  });

  server.tool('toggle_dark_mode', 'Toggle color scheme between light and dark', {
    tabId: z.number().optional().describe('Tab ID'),
    mode: z.enum(['dark', 'light']).describe('Color scheme')
  }, async ({ tabId, mode }) => {
    const res = await bridge.send('toggle_dark_mode', { tabId, mode });
    return { content: [{ type: 'text', text: res.success ? `Color scheme: ${mode}` : `Error: ${res.error}` }] };
  });

  server.tool('disable_cache', 'Enable or disable browser cache', {
    tabId: z.number().optional().describe('Tab ID'),
    disable: z.boolean().describe('true=disable, false=enable')
  }, async ({ tabId, disable }) => {
    const res = await bridge.send('disable_cache', { tabId, disable });
    return { content: [{ type: 'text', text: res.success ? `Cache ${disable ? 'disabled' : 'enabled'}.` : `Error: ${res.error}` }] };
  });

  server.tool('block_urls', 'Block URL patterns (test offline, block analytics)', {
    tabId: z.number().optional().describe('Tab ID'),
    patterns: z.array(z.string()).describe('URL patterns to block (* wildcard)'),
    enable: z.boolean().describe('true=block, false=unblock')
  }, async ({ tabId, patterns, enable }) => {
    const res = await bridge.send('block_urls', { tabId, patterns, enable });
    return { content: [{ type: 'text', text: res.success ? `URL blocking ${enable ? 'enabled' : 'disabled'} for ${patterns.length} patterns.` : `Error: ${res.error}` }] };
  });

  server.tool('inject_css', 'Inject custom CSS into a page', {
    tabId: z.number().optional().describe('Tab ID'),
    css: z.string().describe('CSS code to inject')
  }, async ({ tabId, css }) => {
    const res = await bridge.send('inject_css', { tabId, css });
    return { content: [{ type: 'text', text: res.success ? 'CSS injected.' : `Error: ${res.error}` }] };
  });

  server.tool('get_meta_tags', 'Read meta tags, OG tags, SEO info', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('get_meta_tags', { tabId });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('pdf_page', 'Export page as PDF', {
    tabId: z.number().optional().describe('Tab ID')
  }, async ({ tabId }) => {
    const res = await bridge.send('pdf_page', { tabId }, 60000);
    if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };
    return { content: [{ type: 'text', text: `PDF generated (${((res.data as string).length * 0.75 / 1024).toFixed(0)} KB).` }] };
  });

  server.tool('simulate_slow_network', 'Throttle network speed', {
    tabId: z.number().optional().describe('Tab ID'),
    preset: z.enum(['3g', 'slow-3g', 'offline', 'reset']).describe('Speed preset')
  }, async ({ tabId, preset }) => {
    const res = await bridge.send('simulate_slow_network', { tabId, preset });
    return { content: [{ type: 'text', text: res.success ? `Network: ${preset}` : `Error: ${res.error}` }] };
  });
}
