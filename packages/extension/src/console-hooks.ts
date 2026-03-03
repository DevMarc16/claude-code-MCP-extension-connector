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
