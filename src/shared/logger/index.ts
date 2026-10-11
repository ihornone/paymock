export interface LogContext {
  event: string;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  [key: string]: unknown;
}

const REDACT_KEYS = new Set([
  'x-token',
  'token',
  'authorization',
  'cardnumber',
  'cvv',
  'pan',
  'secret',
]);

function sanitizeValue(key: string, value: unknown): unknown {
  if (typeof key === 'string' && REDACT_KEYS.has(key.toLowerCase())) {
    return '[REDACTED]';
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map((item, idx) => sanitizeValue(String(idx), item));
    }
    const sanitizedObj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitizedObj[k] = sanitizeValue(k, v);
    }
    return sanitizedObj;
  }
  return value;
}

export const logger = {
  info(context: LogContext): void {
    const sanitized = sanitizeValue('root', context) as LogContext;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        service: 'paymock',
        ...sanitized,
      })
    );
  },

  warn(context: LogContext): void {
    const sanitized = sanitizeValue('root', context) as LogContext;
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'WARN',
        service: 'paymock',
        ...sanitized,
      })
    );
  },

  error(context: LogContext): void {
    const sanitized = sanitizeValue('root', context) as LogContext;
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        service: 'paymock',
        ...sanitized,
      })
    );
  },
};
