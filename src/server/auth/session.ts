import { NextRequest, NextResponse } from 'next/server';
import { verifyPersonalAccessToken, isPersonalAccessToken } from './personal-access-token';
import { verifyClerkSessionToken, isClerkDevInstance } from './clerk-jwt';
import { logger } from '@/shared/logger';

export type ActorKind = 'clerk_session' | 'personal_access_token' | 'dev_header';

export interface AuthActor {
  userId: string;
  kind: ActorKind;
  authenticatedByCookie: boolean;
}

let devInstanceWarningLogged = false;

export function warnOnDevClerkInstance(): void {
  if (devInstanceWarningLogged) return;
  if (process.env.NODE_ENV !== 'production') return;
  if (!isClerkDevInstance()) return;

  devInstanceWarningLogged = true;
  logger.warn({
    event: 'clerk_dev_instance_in_production',
    detail:
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a pk_test_ key. Move the deployment to a production Clerk instance (pk_live_) and enable password/OTP sign-in.',
  });
}

export async function authenticateRequest(req: NextRequest): Promise<AuthActor | null> {
  warnOnDevClerkInstance();

  const xToken = req.headers.get('x-token') || req.headers.get('X-Token');
  if (xToken && xToken.trim()) {
    const trimmed = xToken.trim();
    if (isPersonalAccessToken(trimmed)) {
      const userId = await verifyPersonalAccessToken(trimmed);
      if (userId) {
        return { userId, kind: 'personal_access_token', authenticatedByCookie: false };
      }
      return null;
    }
    if (trimmed.startsWith('pmk_live_') || trimmed.startsWith('pmk_demo_')) {
      return null;
    }
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (!token) return null;

    if (isPersonalAccessToken(token)) {
      const userId = await verifyPersonalAccessToken(token);
      if (!userId) return null;
      return { userId, kind: 'personal_access_token', authenticatedByCookie: false };
    }

    const session = await verifyClerkSessionToken(token);
    if (!session) return null;
    return { userId: session.userId, kind: 'clerk_session', authenticatedByCookie: false };
  }

  const sessionCookies = req.cookies
    .getAll()
    .filter(
      (cookie) => cookie.name === '__session' || cookie.name.startsWith('__session_')
    )
    .map((cookie) => cookie.value)
    .filter(Boolean);

  for (const cookie of sessionCookies) {
    const session = await verifyClerkSessionToken(cookie);
    if (session) {
      return { userId: session.userId, kind: 'clerk_session', authenticatedByCookie: true };
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const headerUserId = req.headers.get('x-user-id');
    if (headerUserId && headerUserId.trim()) {
      return {
        userId: headerUserId.trim(),
        kind: 'dev_header',
        authenticatedByCookie: false,
      };
    }
  }

  return null;
}

export interface ActorResult {
  actor: AuthActor;
  error: null;
}

export async function requireActor(req: NextRequest): Promise<
  { actor: AuthActor; error: null } | { actor: null; error: NextResponse }
> {
  const actor = await authenticateRequest(req);
  if (actor) return { actor, error: null };

  return {
    actor: null,
    error: NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    ),
  };
}
