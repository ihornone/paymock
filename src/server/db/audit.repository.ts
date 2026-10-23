import { desc } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { auditLog } from './schema';
import { logger } from '@/shared/logger';

/**
 * Audit trail of every state-changing operation.
 *
 * Before this table existed, an anonymous request could create a project and
 * leave no trace anywhere — no row in the database, no distinguishable log
 * line, nothing to alert on.
 */

export type AuditResult = 'success' | 'denied' | 'error';

export interface AuditEntry {
  actorUserId: string | null;
  actorKind: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  result: AuditResult;
  detail?: string | null;
}

/**
 * Writes an audit row.
 *
 * The write is awaited so that a successful mutation always leaves a trace;
 * a failure to write must not be silently swallowed, but it also must not
 * roll back the operation that was already performed — the error is logged.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDrizzle();

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      actor_user_id: entry.actorUserId,
      actor_kind: entry.actorKind,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.userAgent ? entry.userAgent.slice(0, 512) : null,
      result: entry.result,
      detail: entry.detail ? entry.detail.slice(0, 1_000) : null,
    });
  } catch (err) {
    logger.error({
      event: 'audit_write_failed',
      action: entry.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Recent audit entries — newest first.
 */
export async function listAudit(limit: number = 100): Promise<
  Array<{
    id: string;
    created_at: string;
    actor_user_id: string | null;
    actor_kind: string;
    action: string;
    target_type: string | null;
    target_id: string | null;
    ip: string | null;
    result: string;
    detail: string | null;
  }>
> {
  const db = await getDrizzle();

  return db
    .select({
      id: auditLog.id,
      created_at: auditLog.created_at,
      actor_user_id: auditLog.actor_user_id,
      actor_kind: auditLog.actor_kind,
      action: auditLog.action,
      target_type: auditLog.target_type,
      target_id: auditLog.target_id,
      ip: auditLog.ip,
      result: auditLog.result,
      detail: auditLog.detail,
    })
    .from(auditLog)
    .orderBy(desc(auditLog.created_at))
    .limit(Math.min(Math.max(limit, 1), 500));
}
