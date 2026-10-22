import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy with a per-request nonce.
 *
 * Next.js delivers the React Server Component payload through inline
 * `<script>self.__next_f.push(...)</script>` tags. A `script-src` without
 * `'unsafe-inline'` therefore blocks the application bootstrap and the page
 * stays blank — Next.js reads the nonce from the `Content-Security-Policy`
 * *request* header and applies it to its own inline scripts.
 *
 * The middleware matcher deliberately excludes API routes and static assets:
 * JSON responses have no inline scripts to protect, and skipping them keeps
 * the middleware off the hot path of every API call.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

/**
 * Derives the Clerk Frontend API origin from the publishable key.
 *
 * The key is `pk_<env>_<base64 of the instance host>`, so the host the Clerk
 * SDK has to talk to can be recovered without hard-coding it. A CSP that
 * omits this origin blocks the Clerk API calls and the dashboard never
 * finishes loading.
 */
function getClerkApiOrigin(publishableKey: string | undefined): string | null {
  if (!publishableKey) return null;

  const parts = publishableKey.split('_');
  if (parts.length < 3) return null;

  try {
    const host = atob(parts[2]).replace(/[^a-zA-Z0-9.-]/g, '');
    return host.includes('.') ? `https://${host}` : null;
  } catch {
    return null;
  }
}

function buildContentSecurityPolicy(nonce: string): string {
  const clerkOrigin = getClerkApiOrigin(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  const clerkOrigins = clerkOrigin ? ` ${clerkOrigin}` : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'${clerkOrigins}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${clerkOrigins}`,
    `frame-src 'self'${clerkOrigins}`,
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /api/*        (JSON, no inline scripts, keeps the hot path free)
     *  - /_next/*      (build output)
     *  - static files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
