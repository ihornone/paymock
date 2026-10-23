/**
 * Verification of Clerk session JWTs.
 *
 * The session cookie (`__session`) is a RS256-signed JWT issued by the Clerk
 * frontend API. It used to be decoded without checking the signature, which
 * meant that *anyone* could craft a cookie with an arbitrary `sub` and act as
 * that user — a full account takeover primitive on every cookie-authenticated
 * route.
 *
 * The signature is now verified against the instance's public JWKS. No secret
 * key is involved: the JWKS endpoint is public, and only the instance owner
 * can rotate the private key behind it.
 *
 * Everything fails closed: an unreachable JWKS, an unknown key id, an
 * unexpected algorithm or an expired token all resolve to `null`.
 */

export interface VerifiedClerkSession {
  userId: string;
  sessionId: string | null;
  issuer: string;
  expiresAt: number;
}

interface ClerkInstance {
  /** The issuers a session token of this instance may carry. */
  issuers: string[];
  jwksUrl: string;
}

interface CachedJwks {
  keys: JwkKey[];
  expiresAt: number;
}

/**
 * A JWKS entry.
 *
 * `JsonWebKey` in the DOM lib does not declare the `kid` member, but every
 * JWKS document carries it — the key id is what selects the signing key.
 */
interface JwkKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;

/** key id → CryptoKey */
const keyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

let jwksCache: CachedJwks | null = null;
let instanceCache: ClerkInstance | null = null;

/**
 * Derives the Clerk instance from the publishable key.
 *
 * The key is `pk_<env>_<base64 of the instance host>`, so the frontend API
 * origin can be recovered without hard-coding it. The same trick is used by
 * the CSP builder in `src/middleware.ts`.
 */
export function getClerkInstance(): ClerkInstance | null {
  if (instanceCache) return instanceCache;

  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return null;

  const parts = publishableKey.split('_');
  if (parts.length < 3) return null;

  let host: string;
  try {
    host = atob(parts[2]);
  } catch {
    return null;
  }

  host = host.replace(/[^a-zA-Z0-9.\-]/g, '');
  if (!host.includes('.')) return null;

  instanceCache = {
    // A Clerk session token carries the frontend API origin as its issuer.
    // The Backend API origin (`clerk.<host>`) is accepted as well — it is the
    // same instance, and some Clerk configurations mint tokens for it.
    issuers: [`https://${host}`, `https://clerk.${host}`],
    jwksUrl: `https://${host}/.well-known/jwks.json`,
  };

  return instanceCache;
}

/**
 * True when the instance is a Clerk *development* instance.
 *
 * Dev instances are backed by a shared database that is periodically reset and
 * whose sessions are not subject to the production session policy — running
 * one in production is a configuration mistake, not a choice.
 */
export function isClerkDevInstance(): boolean {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
  return publishableKey.startsWith('pk_test_');
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function decodeJsonSegment(segment: string): Record<string, unknown> | null {
  try {
    const json = base64UrlDecode(segment);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchJwks(instance: ClerkInstance): Promise<JwkKey[] | null> {
  const now = Date.now();
  if (jwksCache && now < jwksCache.expiresAt) return jwksCache.keys;

  try {
    const response = await fetch(instance.jwksUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { keys?: JwkKey[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) return null;

    jwksCache = { keys: body.keys, expiresAt: now + JWKS_CACHE_TTL_MS };
    return body.keys;
  } catch {
    // Fail closed: an unreachable JWKS must not degrade into "no verification".
    return null;
  }
}

async function importVerificationKey(jwk: JwkKey, kid: string): Promise<CryptoKey | null> {
  const now = Date.now();
  const cached = keyCache.get(kid);
  if (cached && now < cached.expiresAt) return cached.key;

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
    keyCache.set(kid, { key, expiresAt: now + KEY_CACHE_TTL_MS });
    return key;
  } catch {
    return null;
  }
}

/**
 * Verifies an RS256 JWT against a JWKS.
 *
 * Split out from `verifyClerkSessionToken` so it can be tested with a
 * locally generated key pair — the signature check is the part that must not
 * be wrong, and it deserves a test that actually signs something.
 */
export async function verifyRs256Jwt(
  token: string,
  jwks: JwkKey[],
  expectedIssuers: string | string[],
  now: number = Math.floor(Date.now() / 1000)
): Promise<VerifiedClerkSession | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodeJsonSegment(parts[0]);
  const payload = decodeJsonSegment(parts[1]);
  if (!header || !payload) return null;

  // Only RS256 is accepted. `none` and the HMAC family are rejected here —
  // an HMAC-signed token would otherwise let anyone who learns the public key
  // mint tokens of their own.
  if (header.alg !== 'RS256') return null;

  const issuer = typeof payload.iss === 'string' ? payload.iss : '';
  const allowedIssuers = Array.isArray(expectedIssuers) ? expectedIssuers : [expectedIssuers];
  if (!allowedIssuers.includes(issuer)) return null;

  if (typeof payload.exp === 'number' && payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;

  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!subject) return null;

  const kid = typeof header.kid === 'string' ? header.kid : '';
  const candidates = kid ? jwks.filter((k) => k.kid === kid) : jwks;
  if (candidates.length === 0) return null;

  let signature: Uint8Array<ArrayBuffer>;
  try {
    const raw = base64UrlDecode(parts[2]);
    const buffer = new ArrayBuffer(raw.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
    signature = view;
  } catch {
    return null;
  }

  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

  for (const jwk of candidates) {
    const key = await importVerificationKey(jwk, jwk.kid || kid || 'default');
    if (!key) continue;

    try {
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        key,
        signature,
        signedData
      );
      if (!valid) continue;

      return {
        userId: subject,
        sessionId: typeof payload.sid === 'string' ? payload.sid : null,
        issuer,
        expiresAt: typeof payload.exp === 'number' ? payload.exp : now,
      };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Verifies a Clerk session JWT and returns the user id it belongs to.
 *
 * Returns `null` for anything that is not a valid, unexpired token signed by
 * this instance.
 */
export async function verifyClerkSessionToken(token: string): Promise<VerifiedClerkSession | null> {
  const instance = getClerkInstance();
  if (!instance) return null;

  const jwks = await fetchJwks(instance);
  if (!jwks) return null;

  return verifyRs256Jwt(token, jwks, instance.issuers);
}
