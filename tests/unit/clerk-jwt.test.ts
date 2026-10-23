import assert from 'node:assert';
import { verifyRs256Jwt } from '../../src/server/auth/clerk-jwt';

/**
 * Tests for the Clerk session JWT verification.
 *
 * The session cookie used to be decoded *without* checking its signature:
 * anyone could craft a cookie with an arbitrary `sub` and act as that user.
 * The verification is now the only thing standing between a browser cookie
 * and an account, so it is tested with real signatures.
 */

const ISSUER = 'https://paymock-test.clerk.accounts.dev';

function base64Url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeKeyPair(): Promise<{
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { kid: string };
}> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;

  return {
    privateKey: pair.privateKey,
    publicJwk: { ...jwk, kid: 'test-key-1', alg: 'RS256', use: 'sig' },
  };
}

async function signJwt(
  privateKey: CryptoKey,
  kid: string,
  payload: Record<string, unknown>
): Promise<string> {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const body = base64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${body}`)
  );

  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

async function runTests() {
  console.log('🧪 Running Clerk JWT verification unit tests...');

  const { privateKey, publicJwk } = await makeKeyPair();
  const jwks = [publicJwk as JsonWebKey & { kid: string }];
  const now = Math.floor(Date.now() / 1000);

  // 1. A properly signed token is accepted.
  const valid = await signJwt(privateKey, 'test-key-1', {
    sub: 'user_2abcDEF',
    iss: ISSUER,
    exp: now + 600,
    sid: 'sess_1',
  });

  const verified = await verifyRs256Jwt(valid, jwks, ISSUER, now);
  assert.ok(verified, 'a valid token is verified');
  assert.strictEqual(verified.userId, 'user_2abcDEF', 'the user id comes from the payload');
  assert.strictEqual(verified.sessionId, 'sess_1', 'the session id comes from the payload');

  // 2. A token signed by another key is rejected.
  const other = await makeKeyPair();
  const foreign = await signJwt(other.privateKey, 'test-key-1', {
    sub: 'user_attacker',
    iss: ISSUER,
    exp: now + 600,
  });

  assert.strictEqual(
    await verifyRs256Jwt(foreign, jwks, ISSUER, now),
    null,
    'a token signed with a foreign key is rejected'
  );

  // 3. A payload that was tampered with after signing is rejected.
  const [header, , signature] = valid.split('.');
  const tamperedPayload = base64Url(
    JSON.stringify({ sub: 'user_admin', iss: ISSUER, exp: now + 600 })
  );
  assert.strictEqual(
    await verifyRs256Jwt(`${header}.${tamperedPayload}.${signature}`, jwks, ISSUER, now),
    null,
    'a tampered payload is rejected'
  );

  // 4. The `alg: none` trick does not work.
  const noneHeader = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const nonePayload = base64Url(
    JSON.stringify({ sub: 'user_admin', iss: ISSUER, exp: now + 600 })
  );
  assert.strictEqual(
    await verifyRs256Jwt(`${noneHeader}.${nonePayload}.`, jwks, ISSUER, now),
    null,
    'an unsigned token is rejected'
  );

  // 5. An expired token is rejected.
  const expired = await signJwt(privateKey, 'test-key-1', {
    sub: 'user_2abcDEF',
    iss: ISSUER,
    exp: now - 10,
  });
  assert.strictEqual(
    await verifyRs256Jwt(expired, jwks, ISSUER, now),
    null,
    'an expired token is rejected'
  );

  // 6. A token from another issuer is rejected.
  const otherIssuer = await signJwt(privateKey, 'test-key-1', {
    sub: 'user_2abcDEF',
    iss: 'https://evil.example',
    exp: now + 600,
  });
  assert.strictEqual(
    await verifyRs256Jwt(otherIssuer, jwks, ISSUER, now),
    null,
    'a token from another issuer is rejected'
  );

  // 7. A token without a subject is rejected.
  const noSubject = await signJwt(privateKey, 'test-key-1', {
    iss: ISSUER,
    exp: now + 600,
  });
  assert.strictEqual(
    await verifyRs256Jwt(noSubject, jwks, ISSUER, now),
    null,
    'a token without a subject is rejected'
  );

  // 8. Garbage is rejected without throwing.
  assert.strictEqual(await verifyRs256Jwt('not-a-jwt', jwks, ISSUER, now), null);
  assert.strictEqual(await verifyRs256Jwt('a.b.c', jwks, ISSUER, now), null);

  console.log('✅ Clerk JWT verification tests passed!');
}

runTests().catch((err) => {
  console.error('❌ Clerk JWT verification tests failed:', err);
  process.exit(1);
});
