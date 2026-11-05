import { NextResponse, type NextRequest } from 'next/server';

import { readRuntimeEnv } from '@/shared/config/runtime-env';

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isPayRoute = request.nextUrl.pathname.startsWith('/pay');
  const csp = buildContentSecurityPolicy(nonce, isPayRoute);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  if (isPayRoute) {
    response.headers.delete('x-frame-options');
  }

  return response;
}

function getClerkOrigins(publishableKey: string | undefined): string[] {
  if (!publishableKey) return [];

  const parts = publishableKey.split('_');
  if (parts.length < 3) return [];

  try {
    const host = atob(parts[2]).replace(/[^a-zA-Z0-9.-]/g, '');
    if (!host.includes('.')) return [];

    const rootDomain = host.startsWith('clerk.') ? host.slice(6) : host;
    return Array.from(
      new Set([
        `https://${host}`,
        `https://${rootDomain}`,
        `https://accounts.${rootDomain}`,
        'https://challenges.cloudflare.com',
      ])
    );
  } catch {
    return [];
  }
}

function buildContentSecurityPolicy(nonce: string, isPayRoute = false): string {
  const origins = getClerkOrigins(readRuntimeEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'));
  const clerkOrigins = origins.length > 0 ? ` ${origins.join(' ')}` : '';
  const frameAncestors = isPayRoute ? "frame-ancestors *" : "frame-ancestors 'self'";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'${clerkOrigins}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${clerkOrigins}`,
    `frame-src 'self'${clerkOrigins}`,
    frameAncestors,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
