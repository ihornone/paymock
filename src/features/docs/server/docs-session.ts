import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { authenticateRequest, type AuthActor } from '@/server/auth/session';

/**
 * Session resolution for the documentation.
 *
 * The docs are a public surface: every article is readable by an anonymous
 * visitor, because the documentation is the first thing an integrating
 * merchant reads. Personalization is opt-in — when a request does carry a
 * credential, the pages can use the actor (e.g. to offer token management);
 * when it does not, they render with a placeholder instead.
 *
 * The credential rules live in `authenticateRequest`: an account token
 * (`pmk_usr_…`), a Clerk session (JWT in `Authorization: Bearer` or in the
 * `__session` cookie) or — outside production — the `x-user-id` development
 * header. The signature of a session token is verified there against the
 * instance JWKS; this module only adapts the Server Component request to
 * the shape that function expects.
 */

/**
 * Resolves the actor of a documentation request, or `null` when the request
 * carries no usable credential. An anonymous visitor is never an error: the
 * article content is public, only the token-bound extras are stubbed out.
 */
export async function getDocsActor(): Promise<AuthActor | null> {
  const requestHeaders = new Headers(await headers());

  // `cookies()` is the authoritative source of the session cookie in a
  // Server Component; the incoming headers are merged in so that a token
  // passed in `X-Token` / `Authorization` is visible as well.
  //
  // The cookies are serialized by hand instead of taking the raw header:
  // `headers()` merges repeated headers with a comma, which would corrupt
  // the `name=value; name=value` format the cookie parser expects.
  const cookieHeader = (await cookies())
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  if (cookieHeader) {
    requestHeaders.set('cookie', cookieHeader);
  }

  const host = requestHeaders.get('host') || 'localhost:8787';
  const proto = requestHeaders.get('x-forwarded-proto') || 'http';

  const request = new NextRequest(`${proto}://${host}/docs`, {
    headers: requestHeaders,
  });

  try {
    return await authenticateRequest(request);
  } catch {
    // A malformed credential must not break the public page: the docs render
    // anonymously and the visitor is told how to authenticate properly.
    return null;
  }
}
