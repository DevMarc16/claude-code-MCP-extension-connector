import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';
import { saveScreenshot } from './visual.js';

export function registerDevCopilotTools(server: McpServer, bridge: BridgeWebSocket) {

  server.tool(
    'dev_health',
    'Get a full development health snapshot: console errors, failed/slow network requests, framework status (Next.js/React), performance metrics, and a screenshot. Call this after code changes to check if anything broke.',
    {
      tabId: z.number().optional().describe('Tab ID. Defaults to active tab.')
    },
    async ({ tabId }) => {
      const res = await bridge.send('dev_health', { tabId }, 60000);
      if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };

      const data = res.data as any;
      const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

      // Text summary
      const lines: string[] = [];
      lines.push(`## Dev Health: ${data.url}`);
      lines.push(`**${data.title}**\n`);

      if (data.framework) {
        const fw = data.framework;
        lines.push(`### Framework`);
        if (fw.nextjsDetected) lines.push(`- Next.js detected`);
        if (fw.reactDetected) lines.push(`- React detected`);
        lines.push(`- HMR: ${fw.hmrStatus}`);
        if (fw.hasErrorOverlay) lines.push(`- **ERROR OVERLAY ACTIVE**: ${fw.errorOverlayMessage?.slice(0, 500)}`);
        if (fw.hasBuildError) lines.push(`- **BUILD ERROR DETECTED**`);
        if (fw.hasReactErrorBoundary) lines.push(`- React error boundary triggered`);
        lines.push('');
      }

      lines.push(`### Errors: ${data.errorCount} | Warnings: ${data.warningCount}`);
      if (data.errors?.length) {
        for (const e of data.errors) {
          lines.push(`- **[${e.category}]** (x${e.count}) ${e.message.slice(0, 300)}`);
          if (e.stack) lines.push(`  \`\`\`\n  ${e.stack.slice(0, 500)}\n  \`\`\``);
        }
      }
      if (data.warnings?.length) {
        lines.push('');
        for (const w of data.warnings) {
          lines.push(`- [warn] (x${w.count}) ${w.message.slice(0, 200)}`);
        }
      }

      lines.push(`\n### Network: ${data.failedRequestCount} failed | ${data.slowRequestCount} slow`);
      if (data.failedRequests?.length) {
        for (const r of data.failedRequests) {
          lines.push(`- **FAIL** ${r.method} ${r.url} → ${r.status || 'ERR'} ${r.statusText || r.errorText || ''} (${r.duration}ms)`);
        }
      }
      if (data.slowRequests?.length) {
        for (const r of data.slowRequests) {
          lines.push(`- SLOW ${r.method} ${r.url} → ${r.status} (${r.duration}ms)`);
        }
      }

      if (data.performance) {
        const p = data.performance;
        lines.push(`\n### Performance`);
        lines.push(`- Load: ${Math.round(p.loadTime || 0)}ms | FCP: ${Math.round(p.firstContentfulPaint || 0)}ms | DOM nodes: ${p.domNodes}`);
        if (p.memoryUsage) lines.push(`- Memory: ${Math.round(p.memoryUsage.usedJSHeapSize / 1024 / 1024)}MB used`);
      }

      content.push({ type: 'text', text: lines.join('\n') });

      if (data.screenshot) {
        content.push({ type: 'image', data: data.screenshot, mimeType: 'image/png' });
        const filepath = saveScreenshot(data.screenshot, 'dev-health');
        content.push({ type: 'text', text: `Screenshot saved to ${filepath}` });
      }

      return { content: content as any };
    }
  );

  server.tool(
    'dev_errors',
    'Get all console errors and warnings, grouped and deduplicated, classified by type (nextjs-build-error, hydration-mismatch, react-error, network-error, runtime-error, unhandled-rejection). Sorted by severity. Includes failed network requests.',
    {
      tabId: z.number().optional().describe('Tab ID. Defaults to active tab.'),
      level: z.enum(['all', 'error', 'warn']).optional().describe('Filter by level. Defaults to all errors+warnings.')
    },
    async ({ tabId, level }) => {
      const res = await bridge.send('dev_errors', { tabId, level });
      if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };

      const data = res.data as any;
      const lines: string[] = [`## ${data.totalCount} Issues Found\n`];

      for (const e of (data.errors || [])) {
        const icon = e.severity === 1 ? '🔴' : e.severity === 2 ? '🟠' : '🟡';
        lines.push(`${icon} **[${e.category}]** (x${e.count}) ${e.message.slice(0, 500)}`);
        if (e.source) lines.push(`   Source: ${e.source}`);
        if (e.stack) lines.push(`   \`\`\`\n   ${e.stack.slice(0, 500)}\n   \`\`\``);
        lines.push('');
      }

      if (!data.errors?.length) lines.push('No errors found.');

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
  );

  server.tool(
    'dev_watch',
    'Start active development monitoring on the current tab. Enables network monitoring and returns current watch state. Console capture is always active.',
    {
      tabId: z.number().optional().describe('Tab ID. Defaults to active tab.')
    },
    async ({ tabId }) => {
      const res = await bridge.send('dev_watch', { tabId });
      if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };

      const data = res.data as any;
      return {
        content: [{
          type: 'text',
          text: `Dev Watch active on tab ${data.tabId}\n- Console capture: ON (always)\n- Network monitoring: ${data.networkMonitoring ? 'ON' : 'OFF'}\n- Logs captured: ${data.logCount}\n- Network requests: ${data.networkRequestCount}`
        }]
      };
    }
  );
}
