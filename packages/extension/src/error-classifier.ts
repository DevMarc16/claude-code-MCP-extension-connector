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
