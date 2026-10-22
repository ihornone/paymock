import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserId } from '@/server/auth/user';
import {
  createPersonalAccessToken,
  listPersonalAccessTokens,
  revokePersonalAccessTokens,
} from '@/server/auth/personal-access-token';
import { logger } from '@/shared/logger';

/**
 * Personal access token management.
 *
 * The token value is returned exactly once — at creation time. Only its
 * SHA-256 hash is stored, so the value cannot be recovered later.
 */
export async function GET(req: NextRequest) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = await listPersonalAccessTokens(userId);

  return NextResponse.json(
    { tokens },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let name = 'default';
  try {
    const body = await req.json();
    if (body && typeof body.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, 64);
    }
  } catch {
    // An empty body is fine — the default token name is used.
  }

  const created = await createPersonalAccessToken(userId, name);

  logger.info({ event: 'personal_access_token_issued', userId, tokenName: name });

  return NextResponse.json(
    {
      // Shown to the user once and never recoverable afterwards.
      token: created.token,
      id: created.id,
      name,
      createdAt: created.createdAt,
    },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

export async function DELETE(req: NextRequest) {
  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name') || undefined;
  const revoked = await revokePersonalAccessTokens(userId, name);

  return NextResponse.json({ success: true, revoked });
}
