import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, type AuthActor } from './session';
import { checkSameOrigin } from './csrf';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/server/rate-limit';
import { recordAudit } from '@/server/db/audit.repository';
import { logger } from '@/shared/logger';

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
  action: string;
  targetType?: string;
  targetId?: string | null;
  rateLimitBucket?: string;
  limit?: number;
  windowMs?: number;
}

export async function guardAdminMutation(
  req: NextRequest,
  options: GuardOptions
): Promise<GuardResult> {
  const ip = getClientIp(req);
  const userAgent = req.headers.get('user-agent');

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
