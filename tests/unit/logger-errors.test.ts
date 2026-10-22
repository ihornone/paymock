import assert from 'node:assert';
import { logger, REDACTED_PLACEHOLDER } from '../../src/shared/logger';
import { AcquiringError, InternalError, PersistenceError, UnauthorizedError } from '../../src/shared/errors';

/**
 * Tests for the structured logger's redaction and the error hierarchy's
 * cause chaining.
 */
function captureLog(fn: () => void): Record<string, unknown> {
  const original = console.log;
  let captured = '';
  console.log = (...args: unknown[]) => {
    captured += args.join(' ');
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return JSON.parse(captured) as Record<string, unknown>;
}

function runTests() {
  console.log('🧪 Running logger & error unit tests...');

  // 1. Secrets are redacted before they reach the log output.
  const entry = captureLog(() =>
    logger.info({
      event: 'test_event',
      token: 'pmk_live_supersecret',
      password: 'hunter2',
      authorization: 'Bearer abc',
      invoiceId: 'p2_123',
    })
  );

  assert.strictEqual(entry.token, REDACTED_PLACEHOLDER, 'the token is redacted');
  assert.strictEqual(entry.password, REDACTED_PLACEHOLDER, 'the password is redacted');
  assert.strictEqual(entry.authorization, REDACTED_PLACEHOLDER, 'the authorization header is redacted');
  assert.strictEqual(entry.invoiceId, 'p2_123', 'non-sensitive fields are preserved');

  // 2. Every entry carries the mandatory structured fields.
  assert.ok(entry.timestamp, 'the entry has a timestamp');
  assert.strictEqual(entry.level, 'INFO', 'the entry has a level');
  assert.strictEqual(entry.service, 'paymock', 'the entry has a service');
  assert.strictEqual(entry.event, 'test_event', 'the entry has an event');

  // 3. Nested objects are redacted too.
  const nested = captureLog(() =>
    logger.info({
      event: 'nested_event',
      payload: { apiKey: 'sk-live-1', nested: { secret: 'x' }, keep: 'visible' },
    })
  );
  const payload = nested.payload as Record<string, unknown>;
  assert.strictEqual(payload.apiKey, REDACTED_PLACEHOLDER, 'nested api keys are redacted');
  assert.strictEqual((payload.nested as Record<string, unknown>).secret, REDACTED_PLACEHOLDER, 'deeply nested secrets are redacted');
  assert.strictEqual(payload.keep, 'visible', 'nested safe values are preserved');

  // 4. The error hierarchy preserves the original cause.
  const rootCause = new Error('connection reset');
  const wrapped = new PersistenceError('failed to load invoice', { cause: rootCause });
  assert.strictEqual(wrapped.cause, rootCause, 'the cause is preserved');
  assert.strictEqual(wrapped.statusCode, 500, 'the status code is mapped on the class');
  assert.strictEqual(wrapped.errCode, 'DATABASE_ERROR', 'the error code is stable');

  // 5. A domain error keeps its own type through the hierarchy.
  const unauthorized = new UnauthorizedError();
  assert.ok(unauthorized instanceof AcquiringError, 'domain errors extend the base class');
  assert.strictEqual(unauthorized.statusCode, 401, 'unauthorized maps to 401');
  assert.deepStrictEqual(
    unauthorized.toResponse(),
    { errCode: 'UNAUTHORIZED', errText: 'authentication required' },
    'the error envelope is consistent'
  );

  // 6. An internal error can carry a cause too.
  const internal = new InternalError('unexpected', 'INTERNAL_ERROR', { cause: rootCause });
  assert.strictEqual(internal.cause, rootCause, 'internal errors preserve the cause');

  console.log('✅ Logger & error unit tests passed.');
}

runTests();
