import { NextRequest } from 'next/server';

export function getRequestUserId(req: NextRequest): string | null {
  // 1. Check custom header (from client fetch)
  const headerUserId = req.headers.get('x-user-id');
  if (headerUserId && headerUserId.trim()) {
    return headerUserId.trim();
  }

  // 2. Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const userId = parseJwtSub(token);
    if (userId) return userId;
  }

  // 3. Check Clerk __session cookie
  const sessionCookie = req.cookies.get('__session')?.value;
  if (sessionCookie) {
    const userId = parseJwtSub(sessionCookie);
    if (userId) return userId;
  }

  return null;
}

function parseJwtSub(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr);
    if (payload && typeof payload.sub === 'string' && payload.sub.trim()) {
      return payload.sub.trim();
    }
  } catch {
    // Ignore malformed JWT
  }
  return null;
}
