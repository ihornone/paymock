import { NextRequest, NextResponse } from 'next/server';

/**
 * Cross-site request forgery protection for cookie-authenticated mutations.
 *
 * The admin API is authenticated with the Clerk session cookie. A cookie is
 * attached by the browser automatically, so any other origin that can make
 * the browser issue a request to this host would inherit the session —
 * unless the request is proven to come from this origin.
 *
 * Two independent signals are accepted:
 *  - `Sec-Fetch-Site: same-origin` / `none` — set by the browser itself and
 *    not forgeable by page JavaScript;
 *  - an `Origin` header matching the deployment's own host.
 *
 * Requests authenticated by a header credential (a personal access token) are
 * not vulnerable and are not checked — a header cannot be attached by a
 * cross-site form post.
 */

export type CsrfResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

function allowedHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();

  const requestHost = req.headers.get('host');
  if (requestHost) hosts.add(requestHost.toLowerCase());

  try {
    if (req.nextUrl?.host) hosts.add(req.nextUrl.host.toLowerCase());
  } catch {
    // `nextUrl` is not available in every runtime — the header covers it.
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
      // A malformed APP_URL must not silently widen the allow-list.
    }
  }

  return hosts;
}

/**
 * Checks that a cookie-authenticated mutation originates from this site.
 */
export function checkSameOrigin(req: NextRequest): CsrfResult {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite) {
    if (fetchSite === 'same-origin' || fetchSite === 'none') {
      return { ok: true };
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    // No origin information at all: a browser would always have sent one for
    // a state-changing request, so the request comes from a non-browser
    // client that should be using a token instead of a cookie.
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  if (allowedHosts(req).has(originHost)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'private, no-store' } }
    ),
  };
}
