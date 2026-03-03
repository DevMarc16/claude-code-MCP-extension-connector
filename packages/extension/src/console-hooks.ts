// Runs in the PAGE's MAIN world at document_start — catches ALL console output
// Relays to content script (ISOLATED world) via postMessage
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
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
          catch { return String(a); }
        }).join(' ');
        window.postMessage({
          type: '__bridge_console__', level,
          message: msg, timestamp: Date.now(),
          source: window.location.href
        }, '*');
      } catch {}
    };
  });
})();
