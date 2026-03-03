import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const screenshotCache = new Map<string, string>();

export function saveScreenshot(base64: string, name?: string): string {
  const dir = join(process.cwd(), 'screenshots');
  mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = name ? `${name}-${timestamp}.png` : `screenshot-${timestamp}.png`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, Buffer.from(base64, 'base64'));
  return filepath;
}

export function registerVisualTools(server: McpServer, bridge: BridgeWebSocket) {
  server.tool(
    'screenshot',
    'Capture a screenshot of a browser tab. Returns the image.',
    {
      tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.'),
      fullPage: z.boolean().optional().describe('Capture full scrollable page'),
      label: z.string().optional().describe('Label for visual_diff comparisons'),
      save: z.boolean().optional().describe('Save screenshot to screenshots/ folder in working directory'),
      saveName: z.string().optional().describe('Custom name prefix for saved file')
    },
    async ({ tabId, fullPage, label, save, saveName }) => {
      const res = await bridge.send('screenshot', { tabId, fullPage }, 60000);
      if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };
      const base64 = res.data as string;
      if (label) screenshotCache.set(label, base64);
      const content: any[] = [{ type: 'image', data: base64, mimeType: 'image/png' }];
      if (save) {
        const filepath = saveScreenshot(base64, saveName);
        content.push({ type: 'text', text: `Saved to ${filepath}` });
      }
      return { content };
    }
  );

  server.tool(
    'screenshot_element',
    'Screenshot a specific element by CSS selector',
    {
      tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.'),
      selector: z.string().describe('CSS selector of element')
    },
    async ({ tabId, selector }) => {
      const res = await bridge.send('screenshot_element', { tabId, selector }, 60000);
      if (!res.success) return { content: [{ type: 'text', text: `Error: ${res.error}` }] };
      return { content: [{ type: 'image', data: res.data as string, mimeType: 'image/png' }] };
    }
  );

  server.tool(
    'visual_diff',
    'Compare two labeled screenshots, highlight differences in red',
    {
      labelA: z.string().describe('First screenshot label'),
      labelB: z.string().describe('Second screenshot label')
    },
    async ({ labelA, labelB }) => {
      const a = screenshotCache.get(labelA);
      const b = screenshotCache.get(labelB);
      if (!a) return { content: [{ type: 'text', text: `No screenshot "${labelA}". Take one with label="${labelA}" first.` }] };
      if (!b) return { content: [{ type: 'text', text: `No screenshot "${labelB}". Take one with label="${labelB}" first.` }] };

      try {
        const imgA = PNG.sync.read(Buffer.from(a, 'base64'));
        const imgB = PNG.sync.read(Buffer.from(b, 'base64'));
        const width = Math.max(imgA.width, imgB.width);
        const height = Math.max(imgA.height, imgB.height);

        const padded = (img: PNG) => {
          if (img.width === width && img.height === height) return img.data;
          const out = new Uint8Array(width * height * 4);
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              const si = (y * img.width + x) * 4;
              const di = (y * width + x) * 4;
              out[di] = img.data[si]; out[di+1] = img.data[si+1]; out[di+2] = img.data[si+2]; out[di+3] = img.data[si+3];
            }
          }
          return out;
        };

        const diff = new PNG({ width, height });
        const numDiff = pixelmatch(padded(imgA), padded(imgB), diff.data, width, height, { threshold: 0.1 });
        const diffBase64 = PNG.sync.write(diff).toString('base64');
        const pct = ((numDiff / (width * height)) * 100).toFixed(2);

        return { content: [
          { type: 'text', text: `Visual diff: ${numDiff} pixels differ (${pct}%). Red = differences.` },
          { type: 'image', data: diffBase64, mimeType: 'image/png' }
        ]};
      } catch (e: any) {
        return { content: [{ type: 'text', text: `Diff error: ${e.message}` }] };
      }
    }
  );

  server.tool(
    'get_responsive_screenshots',
    'Screenshots at mobile (375px), tablet (768px), desktop (1440px)',
    { tabId: z.number().optional().describe('Tab ID. If omitted, uses active tab.') },
    async ({ tabId }) => {
      const viewports = [
        { name: 'mobile', width: 375, height: 812 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1440, height: 900 }
      ];
      const results: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: 'image/png' }> = [];
      for (const vp of viewports) {
        const res = await bridge.send('get_responsive_screenshots', { tabId, ...vp }, 60000);
        if (res.success) {
          results.push({ type: 'text' as const, text: `--- ${vp.name} (${vp.width}x${vp.height}) ---` });
          results.push({ type: 'image' as const, data: res.data as string, mimeType: 'image/png' as const });
        } else {
          results.push({ type: 'text' as const, text: `${vp.name}: Error - ${res.error}` });
        }
      }
      return { content: results };
    }
  );
}
