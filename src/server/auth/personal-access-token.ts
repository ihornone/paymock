import { and, eq, isNull, desc } from 'drizzle-orm';
import { getDrizzle } from '@/server/db/drizzle';
import { personalAccessTokens } from '@/server/db/schema';
import { randomString } from '@/shared/utils/id';
import { logger } from '@/shared/logger';

/**
 * Personal access tokens (PAT).
 *
 * The account-wide API and the MCP server are authenticated with a PAT. Only
 * the SHA-256 hash of the token is stored, so a leaked database row cannot be
 * replayed against the API.
 *
 * The token is a random 32-character string with a `pmk_usr_` prefix. It is
 * shown to the user once, at generation time.
 */
export const PERSONAL_ACCESS_TOKEN_PREFIX = 'pmk_usr_';
export const PERSONAL_ACCESS_TOKEN_LENGTH = 32;
export const PERSONAL_ACCESS_TOKEN_NAME = 'default';

export interface PersonalAccessToken {
  id: string;
  userId: string;
  token: string;
  createdAt: string;
}

/**
 * Hashes a token for storage and lookup.
 *
 * SHA-256 is appropriate here: the token has 32 characters of entropy from a
 * CSPRNG, so there is nothing to brute-force — the hash does not need to be
 * slow.
 */
export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function isPersonalAccessToken(token: string): boolean {
  return token.startsWith(PERSONAL_ACCESS_TOKEN_PREFIX);
}

/**
 * Creates a personal access token for a user, replacing any previous token
 * with the same name.
 */
export async function createPersonalAccessToken(
  userId: string,
  name: string = PERSONAL_ACCESS_TOKEN_NAME
): Promise<PersonalAccessToken> {
  const db = await getDrizzle();
  const token = `${PERSONAL_ACCESS_TOKEN_PREFIX}${randomString(
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    PERSONAL_ACCESS_TOKEN_LENGTH
  )}`;
  const tokenHash = await hashToken(token);
  const now = new Date().toISOString();

  // Only one active token per name — generating a new one revokes the old.
  await db
    .update(personalAccessTokens)
    .set({ revoked_at: now })
    .where(
      and(
        eq(personalAccessTokens.user_id, userId),
        eq(personalAccessTokens.name, name),
        isNull(personalAccessTokens.revoked_at)
      )
    );

  const id = crypto.randomUUID();
  await db.insert(personalAccessTokens).values({
    id,
    user_id: userId,
    token_hash: tokenHash,
    name,
    created_at: now,
  });

  logger.info({ event: 'personal_access_token_created', userId, tokenName: name });

  return { id, userId, token, createdAt: now };
}

/**
 * Resolves a personal access token to its owner.
 *
 * Returns `null` for an unknown or revoked token.
 */
export async function verifyPersonalAccessToken(token: string): Promise<string | null> {
  if (!isPersonalAccessToken(token)) return null;

  const db = await getDrizzle();
  const tokenHash = await hashToken(token);

  const [record] = await db
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.token_hash, tokenHash),
        isNull(personalAccessTokens.revoked_at)
      )
    )
    .limit(1);

  if (!record) return null;

  // Best-effort usage stamp — a failure here must not break authentication.
  void db
    .update(personalAccessTokens)
    .set({ last_used_at: new Date().toISOString() })
    .where(eq(personalAccessTokens.id, record.id))
    .then(() => undefined)
    .catch(() => undefined);

  return record.user_id;
}

/**
 * Revokes every active token of a user.
 */
export async function revokePersonalAccessTokens(
  userId: string,
  name?: string
): Promise<number> {
  const db = await getDrizzle();
  const now = new Date().toISOString();

  const conditions = [
    eq(personalAccessTokens.user_id, userId),
    isNull(personalAccessTokens.revoked_at),
  ];
  if (name) {
    conditions.push(eq(personalAccessTokens.name, name));
  }

  const revoked = await db
    .update(personalAccessTokens)
    .set({ revoked_at: now })
    .where(and(...conditions))
    .returning({ id: personalAccessTokens.id });

  logger.info({ event: 'personal_access_token_revoked', userId, count: revoked.length });

  return revoked.length;
}

/**
 * Metadata about a user's active tokens — the token value itself is never
 * recoverable from storage.
 */
export async function listPersonalAccessTokens(
  userId: string
): Promise<Array<{ id: string; name: string; createdAt: string; lastUsedAt: string | null }>> {
  const db = await getDrizzle();

  const rows = await db
    .select({
      id: personalAccessTokens.id,
      name: personalAccessTokens.name,
      createdAt: personalAccessTokens.created_at,
      lastUsedAt: personalAccessTokens.last_used_at,
    })
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.user_id, userId),
        isNull(personalAccessTokens.revoked_at)
      )
    )
    .orderBy(desc(personalAccessTokens.created_at))
    .limit(10);

  return rows;
}
