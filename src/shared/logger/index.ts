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

/**
 * Field names whose values must never reach the log output.
 *
 * Matches the redaction list used by the API client and error handling skills:
 * credentials, tokens and personal data.
 */
export const REDACTED_KEYS = new Set([
  'x-token',
  'token',
  'pmk_live_token',
  'authorization',
  'auth',
  'password',
  'secret',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'refreshtoken',
  'client_secret',
  'private_key',
  'cardnumber',
  'card_number',
  'cvv',
  'pan',
  'iban',
  'creditcard',
  'ssn',
  'email',
  'cookie',
  'set-cookie',
  'session',
  'hash',
  'credential',
  'encrypted_credentials',
  'serviceaccountkey',
  'tenant_id',
]);

export const REDACTED_PLACEHOLDER = '[REDACTED]';

function isRedactedKey(key: string): boolean {
  return REDACTED_KEYS.has(key.toLowerCase());
}

function sanitizeValue(key: string, value: unknown): unknown {
  if (isRedactedKey(key)) {
    return REDACTED_PLACEHOLDER;
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

/**
 * Structured logger.
 *
 * Every entry carries `timestamp`, `level`, `service` and `event`. Secrets are
 * redacted before serialization.
 */
export const logger = {
  debug(context: LogContext): void {
    if (process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug') {
      return;
    }
    const sanitized = sanitizeValue('root', context) as LogContext;
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'DEBUG',
        service: 'paymock',
        ...sanitized,
      })
    );
  },

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

  /**
   * 4xx rejections are expected outcomes, not defects — they are logged at
   * `info` level so that error tracking stays signal-rich.
   */
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
