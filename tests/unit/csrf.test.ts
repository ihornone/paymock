import assert from 'node:assert';
import { NextRequest } from 'next/server';
import { checkSameOrigin } from '../../src/server/auth/csrf';

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

  assert.ok(
    checkSameOrigin(request({ 'sec-fetch-site': 'same-origin' })).ok,
    'a same-origin fetch is allowed'
  );

  assert.strictEqual(
    checkSameOrigin(request({ 'sec-fetch-site': 'cross-site' })).ok,
    false,
    'a cross-site fetch is rejected'
  );

  assert.strictEqual(
    checkSameOrigin(request({ 'sec-fetch-site': 'same-site' })).ok,
    false,
    'a same-site fetch from another origin is rejected'
  );

  assert.ok(
    checkSameOrigin(request({ 'sec-fetch-site': 'none' })).ok,
    'a user-initiated navigation is allowed'
  );

  assert.ok(
    checkSameOrigin(request({ origin: 'https://paymock.test' })).ok,
    'a matching Origin is allowed'
  );
  assert.strictEqual(
    checkSameOrigin(request({ origin: 'https://evil.example' })).ok,
    false,
    'a foreign Origin is rejected'
  );

  assert.strictEqual(
    checkSameOrigin(request({})).ok,
    false,
    'a request without origin information is rejected'
  );

  assert.strictEqual(
    checkSameOrigin(request({ origin: 'not-a-url' })).ok,
    false,
    'a malformed Origin is rejected'
  );

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
