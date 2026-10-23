import { NextRequest, NextResponse } from 'next/server';
import { verifyPersonalAccessToken, isPersonalAccessToken } from './personal-access-token';
import { verifyClerkSessionToken, isClerkDevInstance } from './clerk-jwt';
import { logger } from '@/shared/logger';

/**
 * The authenticated actor of a request.
 *
 * Every admin/account route resolves the caller through this module, so the
 * rules are in one place: which credential is accepted, how the user id is
 * derived, and whether the request was authenticated by a cookie (which
 * makes it subject to CSRF checks).
 */
export type ActorKind = 'clerk_session' | 'personal_access_token' | 'dev_header';

export interface AuthActor {
  userId: string;
  kind: ActorKind;
  /** True when the credential came from a browser cookie. */
  authenticatedByCookie: boolean;
}

let devInstanceWarningLogged = false;

/**
 * Warns once per isolate when a Clerk *development* instance is used in a
 * production deployment.
 *
 * Dev instances live on a shared database, have no session policy and are
 * reset periodically — running one in production is a configuration mistake
 * that must not pass silently.
 */
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

/**
 * Resolves the actor of a request, or `null` when the request carries no
 * usable credential.
 *
 * Accepted credentials:
 *  - `X-Token: pmk_usr_…` — a personal access token, verified against the
 *    database (the prefix alone grants nothing);
 *  - `Authorization: Bearer <Clerk JWT>` — a Clerk session token, verified
 *    against the instance's JWKS;
 *  - the `__session` cookie — the same Clerk session token, verified the
 *    same way.
 *
 * A *project* token (`pmk_live_…`) is deliberately **not** accepted here: it
 * identifies a merchant project, not an account, and must never grant access
 * to the account-wide API.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthActor | null> {
  warnOnDevClerkInstance();

  // 1. Personal access token.
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
    // A project token is a merchant credential — not an account credential.
    if (trimmed.startsWith('pmk_live_') || trimmed.startsWith('pmk_demo_')) {
      return null;
    }
  }

  // 2. Bearer token — either a personal access token or a Clerk session JWT.
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

  // 3. Clerk session cookie.
  //
  // Clerk supports a *suffixed* session cookie (`__session_<suffix>`) for
  // multi-domain setups, so every candidate is tried.
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

  // 4. Development / test only: an explicit header stands in for a session.
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

/**
 * The same as `authenticateRequest`, but the failure mode is an HTTP 401
 * instead of `null`.
 */
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
