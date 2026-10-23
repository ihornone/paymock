import { NextRequest, NextResponse } from 'next/server';
import { guardAdminMutation, guardAdminRead } from '@/server/auth/admin-guard';
import { recordAudit } from '@/server/db/audit.repository';
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  revokePersonalAccessTokens,
} from '@/server/auth/personal-access-token';
import { logger } from '@/shared/logger';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Personal access token management.
 *
 * The token value is returned exactly once — at creation time. Only its
 * SHA-256 hash is stored, so the value cannot be recovered later.
 */
export async function GET(req: NextRequest) {
  const guard = await guardAdminRead(req, 'account.tokens.list');
  if (!guard.ok) return guard.error;

  const { actor } = guard.context;
  const tokens = await listPersonalAccessTokens(actor.userId);

  return NextResponse.json({ tokens }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const guard = await guardAdminMutation(req, {
    action: 'account.token.issue',
    targetType: 'personal_access_token',
    rateLimitBucket: 'account.token.issue',
    limit: 10,
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  let name = 'default';
  try {
    const body = await req.json();
    if (body && typeof body.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, 64);
    }
  } catch {
    // An empty body is fine — the default token name is used.
  }

  const created = await createPersonalAccessToken(actor.userId, name);

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'account.token.issue',
    targetType: 'personal_access_token',
    targetId: created.id,
    ip,
    userAgent,
    result: 'success',
    detail: name,
  });

  logger.info({ event: 'personal_access_token_issued', userId: actor.userId, tokenName: name });

  return NextResponse.json(
    {
      // Shown to the user once and never recoverable afterwards.
      token: created.token,
      id: created.id,
      name,
      createdAt: created.createdAt,
    },
    { status: 201, headers: NO_STORE }
  );
}

export async function DELETE(req: NextRequest) {
  const guard = await guardAdminMutation(req, {
    action: 'account.token.revoke',
    targetType: 'personal_access_token',
    rateLimitBucket: 'account.token.revoke',
    limit: 30,
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  const name = req.nextUrl.searchParams.get('name') || undefined;
  const revoked = await revokePersonalAccessTokens(actor.userId, name);

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'account.token.revoke',
    targetType: 'personal_access_token',
    ip,
    userAgent,
    result: 'success',
    detail: name ?? 'all',
  });

  return NextResponse.json({ success: true, revoked }, { headers: NO_STORE });
}
