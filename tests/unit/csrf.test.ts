import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { checkSameOrigin } from '../../src/server/auth/csrf';

/**
 * Tests for the CSRF gate of the cookie-authenticated mutations.
 *
 * A cookie is attached by the browser on its own, so a mutation must prove
 * that it originates from this site before it is executed.
 */

function request(headers: Record<string, string>, url = 'https://paymock.test/api/admin/projects') {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      host: 'paymock.test',
      ...headers,
    },
  });
}

function runTests() {
  console.log('🧪 Running CSRF unit tests...');

  // 1. A same-origin fetch is accepted.
  assert.ok(
    checkSameOrigin(request({ 'sec-fetch-site': 'same-origin' })).ok,
    'a same-origin fetch is allowed'
  );

  // 2. A cross-site fetch is rejected.
  assert.strictEqual(
    checkSameOrigin(request({ 'sec-fetch-site': 'cross-site' })).ok,
    false,
    'a cross-site fetch is rejected'
  );

  // 3. A same-site (but cross-origin) fetch is rejected as well: only the
  //    exact origin counts.
  assert.strictEqual(
    checkSameOrigin(request({ 'sec-fetch-site': 'same-site' })).ok,
    false,
    'a same-site fetch from another origin is rejected'
  );

  // 4. A direct navigation is accepted.
  assert.ok(
    checkSameOrigin(request({ 'sec-fetch-site': 'none' })).ok,
    'a user-initiated navigation is allowed'
  );

  // 5. Without Sec-Fetch-Site the Origin header decides.
  assert.ok(
    checkSameOrigin(request({ origin: 'https://paymock.test' })).ok,
    'a matching Origin is allowed'
  );
  assert.strictEqual(
    checkSameOrigin(request({ origin: 'https://evil.example' })).ok,
    false,
    'a foreign Origin is rejected'
  );

  // 6. A request without any origin information is rejected: a browser
  //    always sends one for a state-changing request.
  assert.strictEqual(
    checkSameOrigin(request({})).ok,
    false,
    'a request without origin information is rejected'
  );

  // 7. A malformed Origin is rejected instead of throwing.
  assert.strictEqual(
    checkSameOrigin(request({ origin: 'not-a-url' })).ok,
    false,
    'a malformed Origin is rejected'
  );

  // 8. The configured application URL is part of the allow-list.
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.paymock.test';
  try {
    assert.ok(
      checkSameOrigin(request({ origin: 'https://app.paymock.test' })).ok,
      'the configured application URL is allowed'
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  }

  console.log('✅ CSRF unit tests passed!');
}

runTests();
