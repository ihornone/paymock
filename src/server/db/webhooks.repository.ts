import { eq, and, desc, lt } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { webhookLogs } from './schema';
import * as schema from './schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { clampLimit, DEFAULT_PAGE_SIZE } from '@/shared/utils/pagination';
import type { WebhookLogRecord, CreateWebhookLogDTO } from '@/shared/types/models';

/** How long a delivery log is kept before it is pruned. */
export const WEBHOOK_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Pruning runs on roughly 1 in every N writes. */
export const PRUNE_EVERY_N_WRITES = 50;

/**
 * Columns the dashboard renders. `request_body` and `response_body` are
 * deliberately excluded: the UI never reads them, but they made up the bulk of
 * every dashboard payload and of the `webhook_logs` table size.
 *
 * Aliases keep the public API response shape (snake_case) unchanged.
 */
export const DASHBOARD_WEBHOOK_COLUMNS = {
  id: webhookLogs.id,
  project_id: webhookLogs.project_id,
  invoice_id: webhookLogs.invoice_id,
  url: webhookLogs.url,
  status_code: webhookLogs.status_code,
  duration_ms: webhookLogs.duration_ms,
  created_at: webhookLogs.created_at,
} as const;

export type DashboardWebhookLog = {
  id: string;
  project_id: string;
  invoice_id: string;
  url: string;
  status_code: number | null;
  duration_ms: number | null;
  created_at: string;
};

export class WebhooksRepository {
  private static writeCount = 0;

  async createLog(dto: CreateWebhookLogDTO): Promise<WebhookLogRecord> {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    const [log] = await db
      .insert(webhookLogs)
      .values({
        id: dto.id,
        project_id: dto.projectId,
        invoice_id: dto.invoiceId,
        url: dto.url,
        status_code: dto.statusCode ?? null,
        request_body: dto.requestBody,
        response_body: dto.responseBody ?? null,
        duration_ms: dto.durationMs ?? null,
        error: dto.error ?? null,
        created_at: now,
      })
      .returning();

    // Retention: the table would otherwise grow without bound and every list
    // query would scan more rows. Pruning is probabilistic so the cost is
    // amortised instead of paid on every write.
    this.maybePrune(db);

    return log as WebhookLogRecord;
  }

  /**
   * Deletes delivery logs older than the retention window.
   * Runs on roughly 1 in every `PRUNE_EVERY_N_WRITES` inserts.
   */
  private maybePrune(db: DrizzleD1Database<typeof schema>): void {
    WebhooksRepository.writeCount += 1;
    if (WebhooksRepository.writeCount % PRUNE_EVERY_N_WRITES !== 0) return;

    const cutoff = new Date(Date.now() - WEBHOOK_LOG_RETENTION_MS).toISOString();
    void db
      .delete(webhookLogs)
      .where(lt(webhookLogs.created_at, cutoff))
      .then(() => undefined)
      .catch(() => undefined);
  }

  async list(
    options: {
      projectId?: string;
      invoiceId?: string;
      limit?: number;
    } = {}
  ): Promise<WebhookLogRecord[]> {
    const db = await getDrizzle();
    const conditions = [];

    if (options.projectId) {
      conditions.push(eq(webhookLogs.project_id, options.projectId));
    }
    if (options.invoiceId) {
      conditions.push(eq(webhookLogs.invoice_id, options.invoiceId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = clampLimit(options.limit, DEFAULT_PAGE_SIZE);

    const results = await db
      .select()
      .from(webhookLogs)
      .where(whereClause)
      .orderBy(desc(webhookLogs.created_at))
      .limit(limit);

    return results as WebhookLogRecord[];
  }

  /**
   * Narrow projection for the dashboard feed — no request/response bodies.
   */
  async listForDashboard(
    projectId: string,
    limit: number
  ): Promise<DashboardWebhookLog[]> {
    const db = await getDrizzle();

    const results = await db
      .select(DASHBOARD_WEBHOOK_COLUMNS)
      .from(webhookLogs)
      .where(eq(webhookLogs.project_id, projectId))
      .orderBy(desc(webhookLogs.created_at))
      .limit(clampLimit(limit, DEFAULT_PAGE_SIZE));

    return results as DashboardWebhookLog[];
  }

  /**
   * Most recent log for an invoice. Used to report a delivery result without
   * re-reading the full `request_body` / `response_body` payload.
   */
  async findLatestByInvoice(
    projectId: string,
    invoiceId: string
  ): Promise<DashboardWebhookLog | null> {
    const db = await getDrizzle();

    const [log] = await db
      .select(DASHBOARD_WEBHOOK_COLUMNS)
      .from(webhookLogs)
      .where(and(eq(webhookLogs.project_id, projectId), eq(webhookLogs.invoice_id, invoiceId)))
      .orderBy(desc(webhookLogs.created_at))
      .limit(1);

    return (log as DashboardWebhookLog) ?? null;
  }

  /**
   * Retention: drop delivery logs older than the given cutoff.
   * Without this the table grows without bound and every list query scans more rows.
   */
  async pruneOlderThan(cutoffIso: string): Promise<number> {
    const db = await getDrizzle();

    const deleted = await db
      .delete(webhookLogs)
      .where(lt(webhookLogs.created_at, cutoffIso))
      .returning({ id: webhookLogs.id });

    return deleted.length;
  }
}
