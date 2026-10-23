import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, type AuthActor } from './session';
import { checkSameOrigin } from './csrf';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/server/rate-limit';
import { recordAudit } from '@/server/db/audit.repository';
import { logger } from '@/shared/logger';

/**
 * The common gate in front of every account-scoped mutation.
 *
 * The order matters:
 *  1. **authentication** — no credential, no action (401);
 *  2. **CSRF** — a cookie-authenticated mutation must come from this origin
 *     (403). A token-authenticated request is not forgeable by a third-party
 *     site and is therefore not checked;
 *  3. **rate limit** — a session that suddenly creates dozens of projects is
 *     either broken or hostile (429).
 *
 * Every denial is written to the audit log — an anonymous attempt to create
 * a project is exactly the event an operator wants to see.
 */

export const ADMIN_MUTATION_RATE_LIMIT = 30;
export const ADMIN_READ_RATE_LIMIT = 60;
export const ADMIN_MUTATION_WINDOW_MS = 60_000;

export interface GuardContext {
  actor: AuthActor;
  ip: string;
  userAgent: string | null;
}

export type GuardResult =
  | { ok: true; context: GuardContext; error: null }
  | { ok: false; context: null; error: NextResponse };

export interface GuardOptions {
  /** Audit action name, e.g. `project.create`. */
  action: string;
  /** Targets the mutation is about (filled in by the caller). */
  targetType?: string;
  targetId?: string | null;
  /** Rate-limit bucket suffix, so different routes do not share a counter. */
  rateLimitBucket?: string;
  limit?: number;
  windowMs?: number;
}

/**
 * Applies the gate to a mutating request.
 */
export async function guardAdminMutation(
  req: NextRequest,
  options: GuardOptions
): Promise<GuardResult> {
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

  // 1. Rate limit — *before* authentication.
  //
  // The limit is keyed by IP, not by user: an anonymous brute-force must be
  // throttled too, and it is the IP that is the meaningful bucket at this
  // point. Placing the check after authentication would let an attacker
  // hammer the endpoint with 401s forever.
  const limit = checkRateLimit({
    key: `admin:${options.rateLimitBucket ?? options.action}:${ip}`,
    limit: options.limit ?? ADMIN_MUTATION_RATE_LIMIT,
    windowMs: options.windowMs ?? ADMIN_MUTATION_WINDOW_MS,
  });

  if (!limit.success) {
    await recordAudit({
      actorUserId: null,
      actorKind: 'anonymous',
      action: options.action,
      targetType: options.targetType ?? null,
      targetId: options.targetId ?? null,
      ip,
      userAgent,
      result: 'denied',
      detail: 'rate limit exceeded',
    });

    return {
      ok: false,
      context: null,
      error: rateLimitResponse(limit, 'Too many requests. Please try again later.'),
    };
  }

  // 2. Authentication.
  const actor = await authenticateRequest(req);

  if (!actor) {
    await recordAudit({
      actorUserId: null,
      actorKind: 'anonymous',
      action: options.action,
      targetType: options.targetType ?? null,
      targetId: options.targetId ?? null,
      ip,
      userAgent,
      result: 'denied',
      detail: 'no valid credential',
    });

    logger.warn({
      event: 'admin_mutation_denied',
      action: options.action,
      ip,
      reason: 'unauthenticated',
    });

    return {
      ok: false,
      context: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  // 3. CSRF — a cookie-authenticated mutation must come from this origin.
  if (actor.authenticatedByCookie) {
    const csrf = checkSameOrigin(req);
    if (!csrf.ok) {
      await recordAudit({
        actorUserId: actor.userId,
        actorKind: actor.kind,
        action: options.action,
        targetType: options.targetType ?? null,
        targetId: options.targetId ?? null,
        ip,
        userAgent,
        result: 'denied',
        detail: 'cross-origin request',
      });

      return { ok: false, context: null, error: csrf.response };
    }
  }

  return {
    ok: true,
    context: { actor, ip, userAgent },
    error: null,
  };
}

/**
 * The read-side gate: authentication plus a read rate limit.
 *
 * Reads are not CSRF-sensitive, but they are still throttled: the dashboard
 * polls, and an unbounded read path is a cheap way to burn the account's
 * database quota.
 */
export async function guardAdminRead(
  req: NextRequest,
  action: string
): Promise<GuardResult> {
  const ip = getClientIp(req);
  const actor = await authenticateRequest(req);

  if (!actor) {
    await recordAudit({
      actorUserId: null,
      actorKind: 'anonymous',
      action,
      ip,
      userAgent: req.headers.get('user-agent'),
      result: 'denied',
      detail: 'no valid credential',
    });

    return {
      ok: false,
      context: null,
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
      ),
    };
  }

  const limit = checkRateLimit({
    key: `admin:read:${action}:${actor.userId}:${ip}`,
    limit: ADMIN_READ_RATE_LIMIT,
    windowMs: ADMIN_MUTATION_WINDOW_MS,
  });

  if (!limit.success) {
    return {
      ok: false,
      context: null,
      error: rateLimitResponse(limit, 'Too many requests. Please try again later.'),
    };
  }

  return { ok: true, context: { actor, ip, userAgent: req.headers.get('user-agent') }, error: null };
}
