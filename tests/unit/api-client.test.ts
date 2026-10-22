import assert from 'node:assert';
import { ApiError, apiRequest } from '../../src/shared/api/client';

/**
 * Tests for the centralized API client: error classification, timeouts and
 * the fact that every failure surfaces as a typed `ApiError`.
 */
async function runTests() {
  console.log('🧪 Running API client unit tests...');

  const originalFetch = globalThis.fetch;

  try {
    // 1. A 404 is classified as not_found and is an "expected rejection".
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errCode: 'NOT_FOUND', errText: 'no such thing' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () => apiRequest('/api/thing'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError, 'throws an ApiError');
        assert.strictEqual(err.kind, 'not_found', 'classified as not_found');
        assert.strictEqual(err.status, 404, 'preserves the status code');
        assert.strictEqual(err.code, 'NOT_FOUND', 'preserves the error code');
        assert.strictEqual(err.message, 'no such thing', 'uses the server message');
        assert.strictEqual(err.isExpectedRejection, true, '4xx is an expected rejection');
        return true;
      }
    );

    // 2. A 500 is a server error, not an expected rejection.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errText: 'boom' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () => apiRequest('/api/thing'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.kind, 'server', 'classified as server');
        assert.strictEqual(err.isExpectedRejection, false, '5xx is not an expected rejection');
        return true;
      }
    );

    // 3. A 429 is a rate limit rejection.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errText: 'too many' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    await assert.rejects(
      () => apiRequest('/api/thing'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.kind, 'rate_limit', 'classified as rate_limit');
        return true;
      }
    );

    // 4. A network failure is classified as network and preserves the cause.
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;

    await assert.rejects(
      () => apiRequest('/api/thing'),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.kind, 'network', 'classified as network');
        assert.ok(err.cause instanceof TypeError, 'preserves the original error as cause');
        return true;
      }
    );

    // 5. A successful JSON response is returned parsed.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 'p1', name: 'Shop' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;

    const payload = await apiRequest<{ id: string; name: string }>('/api/thing');
    assert.strictEqual(payload.id, 'p1', 'returns the parsed body');
    assert.strictEqual(payload.name, 'Shop', 'returns the parsed body');

    // 6. A 204 resolves to undefined without throwing.
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    const empty = await apiRequest('/api/thing');
    assert.strictEqual(empty, undefined, 'a 204 resolves to undefined');

    console.log('✅ API client unit tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
