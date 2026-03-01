import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

export function registerDomTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool('get_dom', 'Get DOM tree of a page or subtree via CSS selector', {
    tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.'),
    selector: z.string().optional().describe('CSS selector for subtree root'),
    depth: z.number().optional().describe('Max depth. Default 5.')
  }, async ({ tabId, selector, depth }) => {
    const res = await bridge.send('get_dom', { tabId, selector, depth: depth ?? 5 });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('query_selector', 'Find elements matching a CSS selector', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector'),
    limit: z.number().optional().describe('Max results. Default 20.')
  }, async ({ tabId, selector, limit }) => {
    const res = await bridge.send('query_selector', { tabId, selector, limit: limit ?? 20 });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('click', 'Click an element by CSS selector', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector to click')
  }, async ({ tabId, selector }) => {
    const res = await bridge.send('click', { tabId, selector });
    return { content: [{ type: 'text', text: res.success ? `Clicked: ${selector}` : `Error: ${res.error}` }] };
  });

  server.tool('type_text', 'Type text into an input element', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector of input'),
    text: z.string().describe('Text to type'),
    clear: z.boolean().optional().describe('Clear first. Default true.')
  }, async ({ tabId, selector, text, clear }) => {
    const res = await bridge.send('type_text', { tabId, selector, text, clear: clear ?? true });
    return { content: [{ type: 'text', text: res.success ? `Typed into ${selector}` : `Error: ${res.error}` }] };
  });

  server.tool('fill_form', 'Fill multiple form fields at once', {
    tabId: z.number().optional().describe('Tab ID'),
    fields: z.record(z.string(), z.string()).describe('Map of CSS selector -> value')
  }, async ({ tabId, fields }) => {
    const res = await bridge.send('fill_form', { tabId, fields });
    return { content: [{ type: 'text', text: res.success ? `Filled ${Object.keys(fields).length} fields.` : `Error: ${res.error}` }] };
  });

  server.tool('execute_script', 'Run JavaScript in page context (like DevTools console)', {
    tabId: z.number().optional().describe('Tab ID'),
    code: z.string().describe('JavaScript code to execute')
  }, async ({ tabId, code }) => {
    const res = await bridge.send('execute_script', { tabId, code });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('get_computed_styles', 'Get computed CSS styles for an element', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector'),
    properties: z.array(z.string()).optional().describe('Specific CSS properties')
  }, async ({ tabId, selector, properties }) => {
    const res = await bridge.send('get_computed_styles', { tabId, selector, properties });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('highlight_element', 'Highlight an element with colored overlay', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector'),
    color: z.string().optional().describe('Color. Default rgba(255,0,0,0.3)'),
    duration: z.number().optional().describe('Duration in ms. Default 3000.')
  }, async ({ tabId, selector, color, duration }) => {
    const res = await bridge.send('highlight_element', { tabId, selector, color, duration });
    return { content: [{ type: 'text', text: res.success ? `Highlighted: ${selector}` : `Error: ${res.error}` }] };
  });

  server.tool('get_event_listeners', 'List event listeners on an element', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector')
  }, async ({ tabId, selector }) => {
    const res = await bridge.send('get_event_listeners', { tabId, selector });
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });

  server.tool('wait_for_element', 'Wait for element to appear in DOM', {
    tabId: z.number().optional().describe('Tab ID'),
    selector: z.string().describe('CSS selector'),
    timeout: z.number().optional().describe('Timeout ms. Default 10000.')
  }, async ({ tabId, selector, timeout }) => {
    const t = timeout ?? 10000;
    const res = await bridge.send('wait_for_element', { tabId, selector, timeout: t }, t + 5000);
    return { content: [{ type: 'text', text: res.success ? `Element found: ${selector}` : `Error: ${res.error}` }] };
  });

  server.tool('wait_for_navigation', 'Wait for page navigation to complete', {
    tabId: z.number().optional().describe('Tab ID'),
    timeout: z.number().optional().describe('Timeout ms. Default 30000.')
  }, async ({ tabId, timeout }) => {
    const t = timeout ?? 30000;
    const res = await bridge.send('wait_for_navigation', { tabId, timeout: t }, t + 5000);
    return { content: [{ type: 'text', text: res.success ? JSON.stringify(res.data, null, 2) : `Error: ${res.error}` }] };
  });
}
