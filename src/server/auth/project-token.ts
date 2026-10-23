/**
 * Project (merchant) tokens.
 *
 * A project token is the credential a merchant presents as `X-Token` on the
 * merchant API. It used to be stored — and returned by the API — in
 * plaintext, which turned every database read into a credential leak.
 *
 * Only the SHA-256 hash is stored now. The plaintext value exists exactly
 * twice in the lifetime of a token: in the response of the call that creates
 * or rotates it, and in the hands of whoever issued it.
 */

export const PROJECT_TOKEN_PREFIX = 'pmk_live_';
export const DEMO_TOKEN_PREFIX = 'pmk_demo_';

/**
 * 40 characters of a 62-symbol alphabet ≈ 238 bits of entropy.
 *
 * The token is a bearer credential with no lockout and no rotation window,
 * so the entropy has to carry the whole burden.
 */
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const PROJECT_TOKEN_LENGTH = 40;
export const WEBHOOK_SECRET_LENGTH = 40;

function randomString(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(bytes[i] % alphabet.length);
  }
  return out;
}

/** A fresh merchant token. Shown to the user exactly once. */
export function generateProjectToken(): string {
  return `${PROJECT_TOKEN_PREFIX}${randomString(TOKEN_ALPHABET, PROJECT_TOKEN_LENGTH)}`;
}

/**
 * A fresh demo token for the seeded tenant.
 *
 * The prefix marks it as a demo credential so it can be recognised (and
 * refused) in production.
 */
export function generateDemoToken(): string {
  return `${DEMO_TOKEN_PREFIX}${randomString(TOKEN_ALPHABET, PROJECT_TOKEN_LENGTH)}`;
}

/** A fresh webhook signing secret, used for `X-Paymock-Signature`. */
export function generateWebhookSecret(): string {
  return `whsec_${randomString(TOKEN_ALPHABET, WEBHOOK_SECRET_LENGTH)}`;
}

/**
 * SHA-256 of a token, hex encoded.
 *
 * SHA-256 is the right primitive here: the token carries ~238 bits of
 * entropy from a CSPRNG, so there is nothing to brute-force and the hash
 * does not need to be slow. (A password hash would only add latency to every
 * merchant request.)
 */
export async function hashProjectToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isProjectToken(token: string): boolean {
  return token.startsWith(PROJECT_TOKEN_PREFIX) || token.startsWith(DEMO_TOKEN_PREFIX);
}

/**
 * HMAC-SHA256 of a webhook body, hex encoded.
 *
 * Used to sign outgoing webhooks so the receiver can tell a genuine Paymock
 * delivery from a forged one.
 */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
