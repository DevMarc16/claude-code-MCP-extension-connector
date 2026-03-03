# Dev Copilot Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the browser bridge into a proactive dev copilot that auto-monitors localhost, classifies errors, and gives Claude Code full frontend insight in one call.

**Architecture:** Add 3 new composite MCP tools (`dev_health`, `dev_watch`, `dev_errors`) backed by enhanced console capture (with stack traces), auto-network monitoring on localhost, and Next.js/React framework detection via DOM observation. All new logic lives in dedicated modules wired into existing background.ts.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3 APIs, MCP SDK with Zod schemas, Chrome DevTools Protocol

---

### Task 1: Enhanced Console Hooks — Stack Traces + Better Serialization

**Files:**
- Modify: `packages/extension/src/console-hooks.ts`
- Modify: `packages/shared/src/constants.ts` (bump MAX_CONSOLE_LOGS)

**Step 1: Update console-hooks.ts with stack trace capture and deep serialization**

Replace the entire file:

```ts
// Runs in the PAGE's MAIN world at document_start — catches ALL console output
(function () {
  if ((window as any).__bridgeConsoleHooked) return;
  (window as any).__bridgeConsoleHooked = true;

  const orig: Record<string, Function> = {};
  (['log', 'warn', 'error', 'info', 'debug'] as const).forEach((level) => {
    orig[level] = console[level].bind(console);
    (console as any)[level] = function (...args: any[]) {
      orig[level].apply(console, args);
      try {
        const msg = args.map((a: any) => {
          try {
            if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
            if (typeof a === 'object' && a !== null) return JSON.stringify(a, null, 2).slice(0, 2000);
            return String(a);
          } catch { return String(a); }
        }).join(' ');

        // Capture stack trace for error-level logs
        let stack: string | undefined;
        if (level === 'error' || level === 'warn') {
          try { stack = new Error().stack?.split('\n').slice(2).join('\n'); } catch {}
        }

        window.postMessage({
          type: '__bridge_console__', level,
          message: msg, timestamp: Date.now(),
          source: window.location.href,
          stack
        }, '*');
      } catch {}
    };
  });
})();
```

**Step 2: Update constants**

In `packages/shared/src/constants.ts`, change:
```ts
export const MAX_CONSOLE_LOGS = 2000;
```

**Step 3: Update content.ts to relay stack traces**

In `packages/extension/src/content.ts`, update the postMessage listener to include stack:

```ts
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== '__bridge_console__') return;
  try {
    chrome.runtime.sendMessage({
      type: 'console_log',
      level: event.data.level,
      message: event.data.message,
      timestamp: event.data.timestamp,
      source: event.data.source,
      stack: event.data.stack
    });
  } catch {}
});
```

**Step 4: Update background.ts log storage to include stack**

In `packages/extension/src/background.ts`, update the console_log handler:

```ts
if (message.type === 'console_log' && sender.tab?.id) {
  const tabId = sender.tab.id;
  const logs = consoleLogs.get(tabId) || [];
  logs.push({
    level: message.level, message: message.message,
    timestamp: message.timestamp, source: message.source,
    stack: message.stack
  });
  if (logs.length > 2000) logs.splice(0, logs.length - 2000);
  consoleLogs.set(tabId, logs);
}
```

Update the `consoleLogs` Map type:
```ts
const consoleLogs = new Map<number, Array<{
  level: string; message: string; timestamp: number;
  source?: string; stack?: string;
}>>();
```

**Step 5: Build and verify**

Run: `cd C:/claude-code-ext && npm run build 2>&1`
Expected: Build complete, no errors.

**Step 6: Commit**

```bash
git add packages/extension/src/console-hooks.ts packages/extension/src/content.ts packages/extension/src/background.ts packages/shared/src/constants.ts
git commit -m "feat: enhanced console capture with stack traces and better serialization"
```

---

### Task 2: Error Classifier Module

**Files:**
- Create: `packages/extension/src/error-classifier.ts`

**Step 1: Create the error classifier**

```ts
export type ErrorCategory =
  | 'nextjs-build-error'
  | 'hydration-mismatch'
  | 'react-error'
  | 'network-error'
  | 'runtime-error'
  | 'unhandled-rejection'
  | 'warning'
  | 'info';

export interface ClassifiedLog {
  level: string;
  message: string;
  timestamp: number;
  source?: string;
  stack?: string;
  category: ErrorCategory;
  severity: number; // 1=critical, 2=error, 3=warning, 4=info
  dedupKey: string;
}

const patterns: Array<{ pattern: RegExp; category: ErrorCategory; severity: number }> = [
  { pattern: /Failed to compile/i, category: 'nextjs-build-error', severity: 1 },
  { pattern: /Module build failed/i, category: 'nextjs-build-error', severity: 1 },
  { pattern: /SyntaxError:.*Unexpected token/i, category: 'nextjs-build-error', severity: 1 },
  { pattern: /Hydration failed/i, category: 'hydration-mismatch', severity: 2 },
  { pattern: /Text content does not match/i, category: 'hydration-mismatch', severity: 2 },
  { pattern: /There was an error while hydrating/i, category: 'hydration-mismatch', severity: 2 },
  { pattern: /did not match.*Server:/i, category: 'hydration-mismatch', severity: 2 },
  { pattern: /Minified React error/i, category: 'react-error', severity: 2 },
  { pattern: /Maximum update depth exceeded/i, category: 'react-error', severity: 2 },
  { pattern: /Cannot update a component.*while rendering/i, category: 'react-error', severity: 2 },
  { pattern: /Invalid hook call/i, category: 'react-error', severity: 2 },
  { pattern: /Unhandled Promise Rejection/i, category: 'unhandled-rejection', severity: 2 },
  { pattern: /CORS/i, category: 'network-error', severity: 2 },
  { pattern: /Failed to fetch/i, category: 'network-error', severity: 2 },
  { pattern: /NetworkError/i, category: 'network-error', severity: 2 },
  { pattern: /net::ERR_/i, category: 'network-error', severity: 2 },
];

export function classifyLog(log: { level: string; message: string; timestamp: number; source?: string; stack?: string }): ClassifiedLog {
  let category: ErrorCategory = 'info';
  let severity = 4;

  if (log.level === 'error') {
    category = 'runtime-error';
    severity = 2;
  } else if (log.level === 'warn') {
    category = 'warning';
    severity = 3;
  }

  // Check specific patterns (overrides generic classification)
  for (const { pattern, category: cat, severity: sev } of patterns) {
    if (pattern.test(log.message)) {
      category = cat;
      severity = sev;
      break;
    }
  }

  // Dedup key: first 100 chars of message (strips dynamic values)
  const dedupKey = log.message.replace(/\d+/g, 'N').replace(/0x[0-9a-f]+/gi, 'ADDR').slice(0, 100);

  return { ...log, category, severity, dedupKey };
}

export function groupErrors(logs: ClassifiedLog[]): Array<ClassifiedLog & { count: number }> {
  const groups = new Map<string, ClassifiedLog & { count: number }>();
  for (const log of logs) {
    const existing = groups.get(log.dedupKey);
    if (existing) {
      existing.count++;
      if (log.timestamp > existing.timestamp) {
        existing.message = log.message;
        existing.timestamp = log.timestamp;
        existing.stack = log.stack;
      }
    } else {
      groups.set(log.dedupKey, { ...log, count: 1 });
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.severity - b.severity || b.timestamp - a.timestamp);
}
```

**Step 2: Build and verify**

Run: `cd C:/claude-code-ext && npm run build:ext 2>&1`
Expected: Build complete.

**Step 3: Commit**

```bash
git add packages/extension/src/error-classifier.ts
git commit -m "feat: add error classifier module with pattern matching and dedup"
```

---

### Task 3: Framework Detector Module

**Files:**
- Create: `packages/extension/src/framework-detector.ts`

**Step 1: Create the framework detector**

This runs in the content script (ISOLATED world) and uses MutationObserver to detect Next.js/React error states in the DOM.

```ts
export interface FrameworkStatus {
  nextjsDetected: boolean;
  reactDetected: boolean;
  hmrStatus: 'connected' | 'disconnected' | 'error' | 'unknown';
  hasErrorOverlay: boolean;
  errorOverlayMessage: string | null;
  hasReactErrorBoundary: boolean;
  hasBuildError: boolean;
}

let status: FrameworkStatus = {
  nextjsDetected: false,
  reactDetected: false,
  hmrStatus: 'unknown',
  hasErrorOverlay: false,
  errorOverlayMessage: null,
  hasReactErrorBoundary: false,
  hasBuildError: false,
};

let observer: MutationObserver | null = null;

export function getFrameworkStatus(): FrameworkStatus {
  // One-time detection
  if (!status.nextjsDetected) {
    status.nextjsDetected = !!(
      document.querySelector('script[src*="/_next/"]') ||
      document.getElementById('__next') ||
      (window as any).__NEXT_DATA__
    );
  }
  if (!status.reactDetected) {
    status.reactDetected = !!(
      document.querySelector('[data-reactroot]') ||
      document.getElementById('__next') ||
      document.getElementById('root')
    );
  }

  // Check for error overlays
  checkErrorOverlay();

  return { ...status };
}

function checkErrorOverlay() {
  // Next.js error overlay
  const nextOverlay = document.querySelector('nextjs-portal') ||
    document.querySelector('[data-nextjs-dialog]') ||
    document.querySelector('#nextjs__container_errors_');

  if (nextOverlay) {
    status.hasErrorOverlay = true;
    status.hasBuildError = true;
    const errorText = nextOverlay.textContent?.trim().slice(0, 1000) || null;
    status.errorOverlayMessage = errorText;
  } else {
    status.hasErrorOverlay = false;
    status.errorOverlayMessage = null;
    status.hasBuildError = false;
  }

  // React error boundary detection
  const errorBoundary = document.querySelector('[data-error-boundary]') ||
    document.querySelector('.error-boundary');
  status.hasReactErrorBoundary = !!errorBoundary;
}

export function classifyHmrLog(message: string): void {
  if (/\[HMR\] connected/i.test(message)) status.hmrStatus = 'connected';
  else if (/\[HMR\].*error/i.test(message)) status.hmrStatus = 'error';
  else if (/\[HMR\].*disconnected/i.test(message)) status.hmrStatus = 'disconnected';
  else if (/Fast Refresh.*done/i.test(message)) status.hmrStatus = 'connected';
  else if (/Fast Refresh.*failed/i.test(message)) status.hmrStatus = 'error';
  else if (/Failed to compile/i.test(message)) {
    status.hmrStatus = 'error';
    status.hasBuildError = true;
  }
}

export function startFrameworkDetection(): void {
  if (observer) return;
  observer = new MutationObserver(() => checkErrorOverlay());
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function stopFrameworkDetection(): void {
  observer?.disconnect();
  observer = null;
}
```

**Step 2: Build and verify**

Run: `cd C:/claude-code-ext && npm run build:ext 2>&1`
Expected: Build complete.

**Step 3: Commit**

```bash
git add packages/extension/src/framework-detector.ts
git commit -m "feat: add framework detector for Next.js/React error overlays and HMR"
```

---

### Task 4: Wire Framework Detector + Error Classifier into Content Script

**Files:**
- Modify: `packages/extension/src/content.ts`

**Step 1: Import and wire up modules**

At the top of content.ts, add imports:

```ts
import { classifyHmrLog, startFrameworkDetection, getFrameworkStatus } from './framework-detector.js';
```

Update the postMessage listener to also feed HMR classifier:

```ts
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== '__bridge_console__') return;
  // Feed HMR classifier
  classifyHmrLog(event.data.message);
  try {
    chrome.runtime.sendMessage({
      type: 'console_log',
      level: event.data.level,
      message: event.data.message,
      timestamp: event.data.timestamp,
      source: event.data.source,
      stack: event.data.stack
    });
  } catch {}
});
```

Add new cases to handleSyncCommand:

```ts
case 'get_framework_status': {
  return getFrameworkStatus();
}
```

Start framework detection automatically:

```ts
// At bottom of content.ts, after all handlers
startFrameworkDetection();
```

**Step 2: Build and verify**

Run: `cd C:/claude-code-ext && npm run build:ext 2>&1`
Expected: Build complete.

**Step 3: Commit**

```bash
git add packages/extension/src/content.ts
git commit -m "feat: wire framework detector into content script"
```

---

### Task 5: Auto-Network Monitoring on Localhost

**Files:**
- Modify: `packages/extension/src/background.ts`

**Step 1: Add auto-monitor for localhost tabs**

Add a tab update listener that auto-starts network monitoring on localhost:

```ts
// Auto-start network monitoring on localhost tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isLocalhost = tab.url.startsWith('http://localhost') || tab.url.startsWith('http://127.0.0.1');
    if (isLocalhost && !monitoringNetwork.has(tabId)) {
      monitoringNetwork.add(tabId);
      if (!networkRequests.has(tabId)) networkRequests.set(tabId, []);
      chrome.debugger.attach({ tabId }, '1.3')
        .then(() => chrome.debugger.sendCommand({ tabId }, 'Network.enable'))
        .catch(() => {}); // Silently fail if debugger can't attach
    }
  }
});
```

**Step 2: Enhance network event capture with timing**

Update the debugger event listener to track request timing and flag failures:

```ts
chrome.debugger.onEvent.addListener((source, method, params: any) => {
  if (!source.tabId) return;
  const tabId = source.tabId;

  if (method === 'Network.requestWillBeSent' && monitoringNetwork.has(tabId)) {
    const reqs = networkRequests.get(tabId) || [];
    reqs.push({
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      type: params.type,
      startTime: params.timestamp,
      requestHeaders: params.request.headers,
      _wallTime: Date.now()
    });
    if (reqs.length > 500) reqs.splice(0, reqs.length - 500);
    networkRequests.set(tabId, reqs);
  }

  if (method === 'Network.responseReceived' && monitoringNetwork.has(tabId)) {
    const reqs = networkRequests.get(tabId) || [];
    const entry: any = reqs.find((r: any) => r.requestId === params.requestId);
    if (entry) {
      entry.status = params.response.status;
      entry.statusText = params.response.statusText;
      entry.responseHeaders = params.response.headers;
      entry.size = params.response.encodedDataLength;
      entry.duration = Date.now() - (entry._wallTime || Date.now());
      entry.failed = params.response.status >= 400;
      entry.slow = entry.duration > 2000;
    }
  }

  if (method === 'Network.loadingFailed' && monitoringNetwork.has(tabId)) {
    const reqs = networkRequests.get(tabId) || [];
    const entry: any = reqs.find((r: any) => r.requestId === params.requestId);
    if (entry) {
      entry.failed = true;
      entry.errorText = params.errorText;
      entry.canceled = params.canceled;
      entry.blockedReason = params.blockedReason;
    }
  }
});
```

**Step 3: Build and verify**

Run: `cd C:/claude-code-ext && npm run build:ext 2>&1`
Expected: Build complete.

**Step 4: Commit**

```bash
git add packages/extension/src/background.ts
git commit -m "feat: auto-network monitoring on localhost with timing and failure detection"
```

---

### Task 6: New Composite Commands in Background

**Files:**
- Modify: `packages/extension/src/background.ts`

**Step 1: Import error classifier**

```ts
import { classifyLog, groupErrors } from './error-classifier.js';
```

**Step 2: Add dev_health command to handleCommand switch**

```ts
case 'dev_health': {
  const tabId = await getTabId(req.params);
  const tab = await chrome.tabs.get(tabId);

  // Console errors/warnings
  const allLogs = consoleLogs.get(tabId) || [];
  const classified = allLogs.map(l => classifyLog(l));
  const errors = classified.filter(l => l.severity <= 2);
  const warnings = classified.filter(l => l.severity === 3);

  // Failed/slow network requests
  const reqs = networkRequests.get(tabId) || [];
  const failedReqs = reqs.filter((r: any) => r.failed);
  const slowReqs = reqs.filter((r: any) => r.slow);

  // Framework status via content script
  let frameworkStatus = null;
  try {
    frameworkStatus = await chrome.tabs.sendMessage(tabId, { command: 'get_framework_status', params: {} });
  } catch {}

  // Performance metrics via content script
  let perfMetrics = null;
  try {
    perfMetrics = await chrome.tabs.sendMessage(tabId, { command: 'get_performance_metrics', params: {} });
  } catch {}

  // Screenshot
  let screenshot = null;
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    screenshot = dataUrl.replace(/^data:image\/png;base64,/, '');
  } catch {}

  return respond(req.id, {
    url: tab.url,
    title: tab.title,
    errors: groupErrors(errors).slice(0, 10),
    warnings: groupErrors(warnings).slice(0, 5),
    errorCount: errors.length,
    warningCount: warnings.length,
    failedRequests: failedReqs.slice(-10).map((r: any) => ({
      url: r.url, method: r.method, status: r.status,
      statusText: r.statusText, errorText: r.errorText, duration: r.duration
    })),
    slowRequests: slowReqs.slice(-5).map((r: any) => ({
      url: r.url, method: r.method, status: r.status, duration: r.duration
    })),
    failedRequestCount: failedReqs.length,
    slowRequestCount: slowReqs.length,
    framework: frameworkStatus,
    performance: perfMetrics,
    screenshot
  });
}
```

**Step 3: Add dev_errors command**

```ts
case 'dev_errors': {
  const tabId = await getTabId(req.params);
  const allLogs = consoleLogs.get(tabId) || [];
  const classified = allLogs.map(l => classifyLog(l));
  const errorsAndWarnings = classified.filter(l => l.severity <= 3);
  const grouped = groupErrors(errorsAndWarnings);

  // Also include failed network requests as errors
  const reqs = networkRequests.get(tabId) || [];
  const failedReqs = reqs.filter((r: any) => r.failed).map((r: any) => ({
    level: 'error',
    message: `${r.method} ${r.url} → ${r.status || 'FAILED'} ${r.statusText || r.errorText || ''}`.trim(),
    timestamp: r._wallTime || 0,
    source: r.url,
    category: 'network-error' as const,
    severity: 2,
    dedupKey: `NET:${r.url?.replace(/\?.*/, '')}`,
    count: 1
  }));

  return respond(req.id, {
    errors: [...grouped, ...failedReqs].sort((a, b) => a.severity - b.severity || b.timestamp - a.timestamp),
    totalCount: errorsAndWarnings.length + failedReqs.length
  });
}
```

**Step 4: Add dev_watch command**

```ts
case 'dev_watch': {
  const tabId = await getTabId(req.params);

  // Auto-start network monitoring if not already active
  if (!monitoringNetwork.has(tabId)) {
    monitoringNetwork.add(tabId);
    if (!networkRequests.has(tabId)) networkRequests.set(tabId, []);
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
    } catch {}
  }

  return respond(req.id, {
    tabId,
    consoleCapture: true,   // always on
    networkMonitoring: monitoringNetwork.has(tabId),
    logCount: (consoleLogs.get(tabId) || []).length,
    networkRequestCount: (networkRequests.get(tabId) || []).length
  });
}
```

**Step 5: Build and verify**

Run: `cd C:/claude-code-ext && npm run build:ext 2>&1`
Expected: Build complete.

**Step 6: Commit**

```bash
git add packages/extension/src/background.ts
git commit -m "feat: add dev_health, dev_errors, dev_watch composite commands"
```

---

### Task 7: Update Shared Protocol Types

**Files:**
- Modify: `packages/shared/src/protocol.ts`

**Step 1: Add new command types to the union**

Add to the CommandType union:

```ts
| 'dev_health' | 'dev_errors' | 'dev_watch' | 'get_framework_status'
```

**Step 2: Build and verify**

Run: `cd C:/claude-code-ext && npm run build 2>&1`
Expected: All packages build clean.

**Step 3: Commit**

```bash
git add packages/shared/src/protocol.ts
git commit -m "feat: add dev copilot command types to shared protocol"
```

---

### Task 8: Register New MCP Tools

**Files:**
- Create: `packages/mcp-server/src/tools/dev-tools.ts`
- Modify: `packages/mcp-server/src/server.ts`

**Step 1: Create dev-tools.ts**

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BridgeWebSocket } from '../websocket.js';

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
```

**Step 2: Register in server.ts**

Add import:
```ts
import { registerDevCopilotTools } from './tools/dev-tools.js';
```

Add registration after existing tools:
```ts
registerDevCopilotTools(server, bridge);
```

**Step 3: Build and verify**

Run: `cd C:/claude-code-ext && npm run build 2>&1`
Expected: All packages build clean.

**Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/dev-tools.ts packages/mcp-server/src/server.ts
git commit -m "feat: register dev_health, dev_errors, dev_watch MCP tools"
```

---

### Task 9: Integration Test — Full Workflow

**Step 1: Rebuild everything**

Run: `cd C:/claude-code-ext && npm run build 2>&1`
Expected: All packages build clean, no errors.

**Step 2: Reload extension in Edge**

User reloads the extension from `edge://extensions`.

**Step 3: Restart Claude Code**

User restarts Claude Code session.

**Step 4: Test dev_health**

Navigate to localhost:3000 and call `dev_health`. Verify it returns:
- Console errors and warnings from page load
- Framework detection (Next.js, React, HMR status)
- Performance metrics
- Screenshot
- Any failed/slow network requests

**Step 5: Test dev_errors**

Call `dev_errors`. Verify grouped, classified errors.

**Step 6: Test dev_watch**

Call `dev_watch`. Verify network monitoring starts.

**Step 7: Final commit**

```bash
git add -A
git commit -m "feat: dev copilot mode — complete implementation"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Enhanced console hooks (stack traces) | console-hooks.ts, content.ts, background.ts, constants.ts |
| 2 | Error classifier module | error-classifier.ts (new) |
| 3 | Framework detector module | framework-detector.ts (new) |
| 4 | Wire detector into content script | content.ts |
| 5 | Auto-network monitoring on localhost | background.ts |
| 6 | Composite commands (dev_health, dev_errors, dev_watch) | background.ts |
| 7 | Shared protocol types | protocol.ts |
| 8 | MCP tool registration | dev-tools.ts (new), server.ts |
| 9 | Integration test | Full rebuild + manual test |
