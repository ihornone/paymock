import { readRuntimeEnv } from '@/shared/config/runtime-env';

export interface VerifiedClerkSession {
  userId: string;
  sessionId: string | null;
  issuer: string;
  expiresAt: number;
}

interface ClerkInstance {
  issuers: string[];
  jwksUrl: string;
}

interface CachedJwks {
  keys: JwkKey[];
  expiresAt: number;
}

interface JwkKey extends JsonWebKey {
  kid?: string;
  alg?: string;
  use?: string;
}

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const JWKS_FETCH_TIMEOUT_MS = 5_000;

const keyCache = new Map<string, { key: CryptoKey; expiresAt: number }>();
const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

let jwksCache: CachedJwks | null = null;
let instanceCache: ClerkInstance | null = null;

export function getClerkInstance(): ClerkInstance | null {
  if (instanceCache) return instanceCache;

  const publishableKey = readRuntimeEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
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

  const rootDomain = host.startsWith('clerk.') ? host.slice(6) : host;
  const issuers = Array.from(
    new Set([
      `https://${host}`,
      `https://${rootDomain}`,
      `https://clerk.${rootDomain}`,
      `https://accounts.${rootDomain}`,
    ])
  );

  instanceCache = {
    issuers,
    jwksUrl: `https://${host}/.well-known/jwks.json`,
  };

  return instanceCache;
}

export function isClerkDevInstance(): boolean {
  const publishableKey = readRuntimeEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY') || '';
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

export async function verifyClerkSessionToken(token: string): Promise<VerifiedClerkSession | null> {
  const instance = getClerkInstance();
  if (!instance) return null;

  const jwks = await fetchJwks(instance);
  if (!jwks) return null;

  return verifyRs256Jwt(token, jwks, instance.issuers);
}
