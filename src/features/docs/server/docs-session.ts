import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { authenticateRequest, type AuthActor } from '@/server/auth/session';

/**
 * Access control for the documentation.
 *
 * The docs describe the whole contract of the platform, including the
 * account-scoped endpoints — that is a map of the internal API for anybody
 * who reads it. They are therefore rendered only for an authenticated
 * account.
 *
 * The credential rules live in `authenticateRequest`: an account token
 * (`pmk_usr_…`), a Clerk session (JWT in `Authorization: Bearer` or in the
 * `__session` cookie) or — outside production — the `x-user-id` development
 * header. The signature of a session token is verified there against the
 * instance JWKS; this module only adapts the Server Component request to
 * the shape that function expects.
 */

/**
 * The route an anonymous visitor is sent to. It answers with a real 401, so
 * an automated client sees the refusal instead of a successful response.
 */
const UNAUTHORIZED_PATH = '/docs/unauthorized';

/**
 * Resolves the actor of a documentation request, or `null` when the request
 * carries no usable credential.
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

  return authenticateRequest(request);
}

/**
 * Guards a documentation page.
 *
 * Throws (a redirect) when the visitor is not authenticated — the article
 * content is never rendered for an anonymous request.
 */
export async function requireDocsSession(): Promise<AuthActor> {
  const actor = await getDocsActor();
  if (!actor) {
    redirect(UNAUTHORIZED_PATH);
  }
  return actor;
}
