// Always relay console messages from main world (console-hooks.ts) to background
window.addEventListener('message', (event) => {
  if (event.source !== window || event.data?.type !== '__bridge_console__') return;
  try {
    chrome.runtime.sendMessage({
      type: 'console_log',
      level: event.data.level,
      message: event.data.message,
      timestamp: event.data.timestamp,
      source: event.data.source
    });
  } catch {}
});

// Always capture uncaught errors and unhandled rejections
window.addEventListener('error', (e) => {
  try { chrome.runtime.sendMessage({ type: 'console_log', level: 'error', message: `${e.message} at ${e.filename}:${e.lineno}:${e.colno}`, timestamp: Date.now(), source: e.filename }); } catch {}
});
window.addEventListener('unhandledrejection', (e) => {
  try { chrome.runtime.sendMessage({ type: 'console_log', level: 'error', message: `Unhandled Promise Rejection: ${e.reason}`, timestamp: Date.now(), source: window.location.href }); } catch {}
});

function serializeDOM(el: Element, depth: number, maxDepth: number): any {
  if (depth > maxDepth) return { tag: el.tagName.toLowerCase(), truncated: true };
  const node: any = { tag: el.tagName.toLowerCase() };
  if (el.id) node.id = el.id;
  if (el.className && typeof el.className === 'string') {
    const classes = el.className.trim().split(/\s+/).filter(Boolean);
    if (classes.length) node.classes = classes;
  }
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) { if (attr.name !== 'id' && attr.name !== 'class') attrs[attr.name] = attr.value; }
  if (Object.keys(attrs).length) node.attributes = attrs;
  const directText = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim()).filter(Boolean).join(' ');
  if (directText) node.textContent = directText.slice(0, 200);
  const children = Array.from(el.children);
  if (children.length) node.children = children.map(c => serializeDOM(c, depth + 1, maxDepth));
  return node;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const { command, params } = message;

  if (command === 'wait_for_element' || command === 'wait_for_navigation') {
    handleAsyncCommand(command, params, sendResponse);
    return true;
  }

  sendResponse(handleSyncCommand(command, params));
  return false;
});

function handleAsyncCommand(command: string, params: any, sendResponse: (r: any) => void) {
  if (command === 'wait_for_element') {
    const timeout = params?.timeout ?? 10000;
    if (document.querySelector(params?.selector)) { sendResponse(true); return; }
    let resolved = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector(params?.selector) && !resolved) { resolved = true; observer.disconnect(); sendResponse(true); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { if (!resolved) { resolved = true; observer.disconnect(); sendResponse({ error: `Timeout: ${params?.selector}` }); } }, timeout);
  }
  if (command === 'wait_for_navigation') {
    const timeout = params?.timeout ?? 30000;
    let resolved = false;
    const handler = () => { if (!resolved) { resolved = true; sendResponse({ url: window.location.href, title: document.title }); } };
    window.addEventListener('load', handler, { once: true });
    setTimeout(() => { if (!resolved) { resolved = true; window.removeEventListener('load', handler); sendResponse({ error: 'Navigation timeout' }); } }, timeout);
  }
}

function handleSyncCommand(command: string, params: any): any {
  switch (command) {
    case 'start_console_capture': return true; // Auto-captured via console-hooks.ts
    case 'stop_console_capture': return true;
    case 'get_dom': {
      const root = params?.selector ? document.querySelector(params.selector) : document.body;
      if (!root) return { error: `Not found: ${params?.selector}` };
      return serializeDOM(root, 0, params?.depth ?? 5);
    }
    case 'query_selector': {
      const els = document.querySelectorAll(params.selector);
      return Array.from(els).slice(0, params.limit ?? 20).map(el => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(), id: el.id || undefined,
          classes: el.className && typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : undefined,
          textContent: el.textContent?.trim().slice(0, 200),
          attributes: Object.fromEntries(Array.from(el.attributes as unknown as Attr[]).map(a => [a.name, a.value])),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        };
      });
    }
    case 'click': {
      const el = document.querySelector(params.selector);
      if (!el) return { error: `Not found: ${params.selector}` };
      (el as HTMLElement).click();
      return true;
    }
    case 'type_text': {
      const el = document.querySelector(params.selector) as HTMLInputElement;
      if (!el) return { error: `Not found: ${params.selector}` };
      if (params.clear !== false) el.value = '';
      el.focus(); el.value += params.text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    case 'fill_form': {
      const errors: string[] = [];
      for (const [sel, val] of Object.entries(params.fields as Record<string, string>)) {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (!el) { errors.push(`Not found: ${sel}`); continue; }
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return errors.length ? { errors } : true;
    }
    case 'execute_script': {
      // Intentional: equivalent to browser DevTools console.
      // Only accessible via localhost WebSocket from authenticated Claude Code session.
      try { return new Function('return ' + params.code)(); }
      catch (e: any) { return { error: e.message }; }
    }
    case 'get_computed_styles': {
      const el = document.querySelector(params.selector);
      if (!el) return { error: `Not found: ${params.selector}` };
      const styles = window.getComputedStyle(el);
      if (params.properties) {
        const r: Record<string, string> = {};
        for (const p of params.properties) r[p] = styles.getPropertyValue(p);
        return r;
      }
      const r: Record<string, string> = {};
      for (let i = 0; i < styles.length; i++) r[styles[i]] = styles.getPropertyValue(styles[i]);
      return r;
    }
    case 'highlight_element': {
      const el = document.querySelector(params.selector) as HTMLElement;
      if (!el) return { error: `Not found: ${params.selector}` };
      const overlay = document.createElement('div');
      const rect = el.getBoundingClientRect();
      Object.assign(overlay.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width}px`, height: `${rect.height}px`,
        backgroundColor: params.color || 'rgba(255,0,0,0.3)',
        border: '2px solid red', pointerEvents: 'none', zIndex: '999999', transition: 'opacity 0.3s'
      });
      document.body.appendChild(overlay);
      setTimeout(() => { overlay.style.opacity = '0'; setTimeout(() => overlay.remove(), 300); }, params.duration || 3000);
      return true;
    }
    case 'get_event_listeners': {
      const el = document.querySelector(params.selector);
      if (!el) return { error: `Not found: ${params.selector}` };
      const listeners: Record<string, boolean> = {};
      for (const key of Object.keys(el)) { if (key.startsWith('on') && (el as any)[key]) listeners[key.slice(2)] = true; }
      return listeners;
    }
    case 'get_local_storage': {
      if (params?.key) return localStorage.getItem(params.key);
      const d: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; d[k] = localStorage.getItem(k)!; }
      return d;
    }
    case 'get_session_storage': {
      if (params?.key) return sessionStorage.getItem(params.key);
      const d: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i)!; d[k] = sessionStorage.getItem(k)!; }
      return d;
    }
    case 'get_meta_tags': {
      const tags: Array<Record<string, string>> = [];
      document.querySelectorAll('meta').forEach(m => {
        const e: Record<string, string> = {};
        for (const a of Array.from(m.attributes)) e[a.name] = a.value;
        tags.push(e);
      });
      return { title: document.title, meta: tags, canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'), language: document.documentElement.lang };
    }
    case 'get_performance_metrics': {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
      const m: any = {
        loadTime: nav ? nav.loadEventEnd - nav.startTime : null,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null,
        firstContentfulPaint: fcp ? fcp.startTime : null,
        domInteractive: nav ? nav.domInteractive - nav.startTime : null,
        transferSize: nav ? nav.transferSize : null,
        domNodes: document.querySelectorAll('*').length
      };
      if ((performance as any).memory) {
        m.memoryUsage = { usedJSHeapSize: (performance as any).memory.usedJSHeapSize, totalJSHeapSize: (performance as any).memory.totalJSHeapSize };
      }
      return m;
    }
    case 'get_accessibility_report': {
      const v: Array<{ type: string; severity: string; message: string; element: string }> = [];
      document.querySelectorAll('img:not([alt])').forEach(i => v.push({ type: 'img-alt', severity: 'critical', message: 'Image missing alt', element: i.outerHTML.slice(0, 200) }));
      document.querySelectorAll('a').forEach(a => {
        if (!a.textContent?.trim() && !a.querySelector('img[alt]') && !a.getAttribute('aria-label'))
          v.push({ type: 'empty-link', severity: 'serious', message: 'Link has no accessible text', element: a.outerHTML.slice(0, 200) });
      });
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select').forEach(inp => {
        const id = inp.id;
        if (!(id && document.querySelector(`label[for="${id}"]`)) && !inp.getAttribute('aria-label') && !inp.getAttribute('aria-labelledby') && !inp.closest('label'))
          v.push({ type: 'missing-label', severity: 'serious', message: 'Input missing label', element: inp.outerHTML.slice(0, 200) });
      });
      document.querySelectorAll('button').forEach(b => {
        if (!b.textContent?.trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt]'))
          v.push({ type: 'empty-button', severity: 'serious', message: 'Button has no text', element: b.outerHTML.slice(0, 200) });
      });
      if (!document.documentElement.lang) v.push({ type: 'html-lang', severity: 'serious', message: 'Missing lang attribute', element: '<html>' });
      if (!document.title) v.push({ type: 'document-title', severity: 'serious', message: 'Missing title', element: '<head>' });
      return { url: window.location.href, violationCount: v.length, violations: v };
    }
    case 'inject_css': {
      const s = document.createElement('style');
      s.textContent = params.css;
      s.setAttribute('data-bridge-injected', 'true');
      document.head.appendChild(s);
      return true;
    }
    case 'toggle_dark_mode': {
      document.documentElement.style.colorScheme = params.mode as string;
      return true;
    }
    default: return { error: `Unknown: ${command}` };
  }
}