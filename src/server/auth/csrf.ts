import { NextRequest, NextResponse } from 'next/server';

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
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host.toLowerCase());
    } catch {
    }
  }

  return hosts;
}

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
