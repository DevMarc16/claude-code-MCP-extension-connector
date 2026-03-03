import { WS_URL, RECONNECT_INTERVAL_MS, type BridgeRequest, type BridgeResponse } from './types.js';

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnected = false;

const consoleLogs = new Map<number, Array<{ level: string; message: string; timestamp: number; source?: string; stack?: string }>>();
const networkRequests = new Map<number, Array<Record<string, unknown>>>();
const monitoringConsole = new Set<number>();
const monitoringNetwork = new Set<number>();

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      isConnected = true;
      console.log('[Bridge] Connected to MCP server');
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };
    ws.onmessage = async (event) => {
      try {
        const request: BridgeRequest = JSON.parse(event.data as string);
        const response = await handleCommand(request);
        ws?.send(JSON.stringify(response));
      } catch (e: any) {
        console.error('[Bridge] Error handling message:', e);
      }
    };
    ws.onclose = () => {
      isConnected = false; ws = null;
      console.log('[Bridge] Disconnected');
      scheduleReconnect();
    };
    ws.onerror = () => { ws?.close(); };
  } catch (e) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_INTERVAL_MS);
}

async function getTabId(params: Record<string, unknown>): Promise<number> {
  if (params.tabId && typeof params.tabId === 'number') return params.tabId;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return tab.id;
}

function respond(id: string, data: unknown): BridgeResponse { return { id, success: true, data }; }
function respondError(id: string, error: string): BridgeResponse { return { id, success: false, error }; }

async function handleCommand(req: BridgeRequest): Promise<BridgeResponse> {
  try {
    switch (req.command) {
      case 'list_tabs': {
        const tabs = await chrome.tabs.query({});
        return respond(req.id, tabs.map(t => ({ id: t.id, title: t.title, url: t.url, active: t.active, windowId: t.windowId, favIconUrl: t.favIconUrl, status: t.status })));
      }
      case 'get_active_tab': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return respondError(req.id, 'No active tab');
        return respond(req.id, { id: tab.id, title: tab.title, url: tab.url, active: tab.active, windowId: tab.windowId, favIconUrl: tab.favIconUrl, status: tab.status });
      }
      case 'navigate': {
        const tabId = await getTabId(req.params);
        await chrome.tabs.update(tabId, { url: req.params.url as string });
        return respond(req.id, { tabId, url: req.params.url });
      }
      case 'open_tab': {
        const tab = await chrome.tabs.create({ url: req.params.url as string | undefined });
        return respond(req.id, { id: tab.id, title: tab.title, url: tab.url });
      }
      case 'close_tab': {
        await chrome.tabs.remove(req.params.tabId as number);
        return respond(req.id, null);
      }
      case 'reload_tab': {
        const tabId = await getTabId(req.params);
        await chrome.tabs.reload(tabId, { bypassCache: req.params.bypassCache as boolean | undefined });
        return respond(req.id, null);
      }
      case 'screenshot': {
        const tabId = await getTabId(req.params);
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tabId, { active: true });
        if (req.params.fullPage) {
          try {
            await chrome.debugger.attach({ tabId }, '1.3');
            const layoutMetrics: any = await chrome.debugger.sendCommand({ tabId }, 'Page.getLayoutMetrics');
            const { width, height } = layoutMetrics.contentSize;
            await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', { width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 1, mobile: false });
            const result: any = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
            await chrome.debugger.detach({ tabId });
            return respond(req.id, result.data);
          } catch (e: any) {
            try { await chrome.debugger.detach({ tabId }); } catch {}
            return respondError(req.id, `Full page screenshot failed: ${e.message}`);
          }
        } else {
          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
          return respond(req.id, dataUrl.replace(/^data:image\/png;base64,/, ''));
        }
      }
      case 'screenshot_element': {
        const tabId = await getTabId(req.params);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          const doc: any = await chrome.debugger.sendCommand({ tabId }, 'DOM.getDocument');
          const node: any = await chrome.debugger.sendCommand({ tabId }, 'DOM.querySelector', { nodeId: doc.root.nodeId, selector: req.params.selector as string });
          if (!node.nodeId) { await chrome.debugger.detach({ tabId }); return respondError(req.id, `Element not found: ${req.params.selector}`); }
          const box: any = await chrome.debugger.sendCommand({ tabId }, 'DOM.getBoxModel', { nodeId: node.nodeId });
          const quad = box.model.border;
          const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
          const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
          const w = Math.max(quad[0], quad[2], quad[4], quad[6]) - x;
          const h = Math.max(quad[1], quad[3], quad[5], quad[7]) - y;
          const result: any = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png', clip: { x, y, width: w, height: h, scale: 1 } });
          await chrome.debugger.detach({ tabId });
          return respond(req.id, result.data);
        } catch (e: any) {
          try { await chrome.debugger.detach({ tabId }); } catch {}
          return respondError(req.id, `Element screenshot failed: ${e.message}`);
        }
      }
      case 'get_responsive_screenshots': {
        const tabId = await getTabId(req.params);
        const width = req.params.width as number;
        const height = req.params.height as number;
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
          await new Promise(r => setTimeout(r, 500));
          const result: any = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', { format: 'png' });
          await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
          await chrome.debugger.detach({ tabId });
          return respond(req.id, result.data);
        } catch (e: any) {
          try { await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride'); await chrome.debugger.detach({ tabId }); } catch {}
          return respondError(req.id, `Responsive screenshot failed: ${e.message}`);
        }
      }
      // Execute script in page main world via chrome.scripting API (bypasses CSP)
      // Intentional: equivalent to browser DevTools console — only accessible via
      // localhost WebSocket from an authenticated Claude Code session.
      case 'execute_script': {
        const tabId = await getTabId(req.params);
        const code = req.params.code as string;
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            // eslint-disable-next-line no-eval -- DevTools-equivalent eval, auth-gated
            func: (c: string) => { try { return (0, globalThis.eval)(c); } catch (e: any) { return { error: e.message }; } },
            args: [code]
          });
          return respond(req.id, results[0]?.result);
        } catch (e: any) {
          return respondError(req.id, e.message);
        }
      }
      // Content script commands
      case 'get_dom': case 'query_selector': case 'click': case 'type_text': case 'fill_form':
      case 'get_computed_styles': case 'highlight_element':
      case 'get_event_listeners': case 'wait_for_element': case 'wait_for_navigation':
      case 'get_local_storage': case 'get_session_storage': case 'get_meta_tags':
      case 'get_performance_metrics': case 'get_accessibility_report':
      case 'inject_css': case 'toggle_dark_mode': {
        const tabId = await getTabId(req.params);
        const results = await chrome.tabs.sendMessage(tabId, { command: req.command, params: req.params });
        return respond(req.id, results);
      }
      // Console monitoring — always active, this just acknowledges the command
      case 'monitor_console': {
        const tabId = await getTabId(req.params);
        if (!consoleLogs.has(tabId)) consoleLogs.set(tabId, []);
        return respond(req.id, null);
      }
      case 'get_console_logs': {
        const tabId = await getTabId(req.params);
        const logs = consoleLogs.get(tabId) || [];
        const level = req.params.level as string;
        return respond(req.id, level && level !== 'all' ? logs.filter(l => l.level === level) : logs);
      }
      case 'clear_console': {
        const tabId = await getTabId(req.params);
        consoleLogs.set(tabId, []);
        return respond(req.id, null);
      }
      case 'get_page_errors': {
        const tabId = await getTabId(req.params);
        return respond(req.id, (consoleLogs.get(tabId) || []).filter(l => l.level === 'error'));
      }
      // Network monitoring
      case 'monitor_network': {
        const tabId = await getTabId(req.params);
        if (req.params.enable) {
          monitoringNetwork.add(tabId);
          if (!networkRequests.has(tabId)) networkRequests.set(tabId, []);
          try {
            await chrome.debugger.attach({ tabId }, '1.3');
            await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
          } catch (e: any) { return respondError(req.id, `Failed: ${e.message}`); }
        } else {
          monitoringNetwork.delete(tabId);
          try { await chrome.debugger.sendCommand({ tabId }, 'Network.disable'); await chrome.debugger.detach({ tabId }); } catch {}
        }
        return respond(req.id, null);
      }
      case 'get_network_requests': {
        const tabId = await getTabId(req.params);
        let reqs = networkRequests.get(tabId) || [];
        if (req.params.urlFilter) reqs = reqs.filter((r: any) => r.url?.includes(req.params.urlFilter));
        if (req.params.methodFilter) reqs = reqs.filter((r: any) => r.method === req.params.methodFilter);
        return respond(req.id, reqs);
      }
      case 'get_cookies': {
        const tabId = await getTabId(req.params);
        let url = req.params.url as string | undefined;
        if (!url) { const tab = await chrome.tabs.get(tabId); url = tab.url; }
        return respond(req.id, await chrome.cookies.getAll({ url }));
      }
      // Debugger tools
      case 'disable_cache': {
        const tabId = await getTabId(req.params);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          await chrome.debugger.sendCommand({ tabId }, 'Network.setCacheDisabled', { cacheDisabled: req.params.disable as boolean });
          await chrome.debugger.detach({ tabId });
          return respond(req.id, null);
        } catch (e: any) { try { await chrome.debugger.detach({ tabId }); } catch {} return respondError(req.id, e.message); }
      }
      case 'block_urls': {
        const tabId = await getTabId(req.params);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          await chrome.debugger.sendCommand({ tabId }, 'Network.setBlockedURLs', { urls: req.params.enable ? req.params.patterns as string[] : [] });
          await chrome.debugger.detach({ tabId });
          return respond(req.id, null);
        } catch (e: any) { try { await chrome.debugger.detach({ tabId }); } catch {} return respondError(req.id, e.message); }
      }
      case 'simulate_slow_network': {
        const tabId = await getTabId(req.params);
        const presets: Record<string, any> = {
          '3g': { offline: false, latency: 100, downloadThroughput: 750000, uploadThroughput: 250000 },
          'slow-3g': { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
          'offline': { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
          'reset': { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
        };
        const preset = presets[req.params.preset as string];
        if (!preset) return respondError(req.id, `Unknown preset: ${req.params.preset}`);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          await chrome.debugger.sendCommand({ tabId }, 'Network.emulateNetworkConditions', preset);
          if (req.params.preset === 'reset') await chrome.debugger.detach({ tabId });
          return respond(req.id, null);
        } catch (e: any) { try { await chrome.debugger.detach({ tabId }); } catch {} return respondError(req.id, e.message); }
      }
      case 'emulate_device': {
        const tabId = await getTabId(req.params);
        const devices: Record<string, any> = {
          'iphone-14': { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
          'iphone-se': { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' },
          'pixel-7': { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7)' },
          'ipad': { width: 810, height: 1080, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' },
          'ipad-pro': { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' }
        };
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          if (req.params.device === 'reset') {
            await chrome.debugger.sendCommand({ tabId }, 'Emulation.clearDeviceMetricsOverride');
            await chrome.debugger.sendCommand({ tabId }, 'Network.setUserAgentOverride', { userAgent: '' });
          } else {
            const device = devices[req.params.device as string];
            if (!device) { await chrome.debugger.detach({ tabId }); return respondError(req.id, `Unknown device: ${req.params.device}`); }
            await chrome.debugger.sendCommand({ tabId }, 'Emulation.setDeviceMetricsOverride', device);
            await chrome.debugger.sendCommand({ tabId }, 'Network.setUserAgentOverride', { userAgent: device.userAgent });
          }
          await chrome.debugger.detach({ tabId });
          return respond(req.id, null);
        } catch (e: any) { try { await chrome.debugger.detach({ tabId }); } catch {} return respondError(req.id, e.message); }
      }
      case 'pdf_page': {
        const tabId = await getTabId(req.params);
        try {
          await chrome.debugger.attach({ tabId }, '1.3');
          const result: any = await chrome.debugger.sendCommand({ tabId }, 'Page.printToPDF', { landscape: false, printBackground: true });
          await chrome.debugger.detach({ tabId });
          return respond(req.id, result.data);
        } catch (e: any) { try { await chrome.debugger.detach({ tabId }); } catch {} return respondError(req.id, e.message); }
      }
      default:
        return respondError(req.id, `Unknown command: ${req.command}`);
    }
  } catch (e: any) {
    return respondError(req.id, e.message);
  }
}

chrome.debugger.onEvent.addListener((source, method, params: any) => {
  if (!source.tabId) return;
  if (method === 'Network.requestWillBeSent' && monitoringNetwork.has(source.tabId)) {
    const reqs = networkRequests.get(source.tabId) || [];
    reqs.push({ requestId: params.requestId, url: params.request.url, method: params.request.method, type: params.type, startTime: params.timestamp, requestHeaders: params.request.headers });
    networkRequests.set(source.tabId, reqs);
  }
  if (method === 'Network.responseReceived' && monitoringNetwork.has(source.tabId)) {
    const reqs = networkRequests.get(source.tabId) || [];
    const entry = reqs.find((r: any) => r.requestId === params.requestId);
    if (entry) { (entry as any).status = params.response.status; (entry as any).statusText = params.response.statusText; (entry as any).responseHeaders = params.response.headers; (entry as any).size = params.response.encodedDataLength; }
  }
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always capture console logs from all tabs
  if (message.type === 'console_log' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const logs = consoleLogs.get(tabId) || [];
    logs.push({ level: message.level, message: message.message, timestamp: message.timestamp, source: message.source, stack: message.stack });
    if (logs.length > 2000) logs.splice(0, logs.length - 2000);
    consoleLogs.set(tabId, logs);
  }
  if (message.command === 'get_bridge_status') { sendResponse({ connected: isConnected }); return true; }
  if (message.command === 'reconnect') { connect(); sendResponse({ ok: true }); return true; }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  consoleLogs.delete(tabId); networkRequests.delete(tabId);
  monitoringConsole.delete(tabId); monitoringNetwork.delete(tabId);
});

// Use chrome.alarms instead of setInterval — survives service worker suspension
chrome.alarms.create('bridge-reconnect', { periodInMinutes: 0.05 }); // ~3 seconds
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'bridge-reconnect' && !isConnected) connect();
});
connect();
