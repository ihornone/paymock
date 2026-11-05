import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { authenticateRequest, type AuthActor } from '@/server/auth/session';

export async function getDocsActor(): Promise<AuthActor | null> {
  const requestHeaders = new Headers(await headers());

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
    return null;
  }
}
