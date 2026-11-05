import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { webhookLogs } from './schema';
import * as schema from './schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { clampLimit, DEFAULT_PAGE_SIZE } from '@/shared/utils/pagination';
import type { WebhookLogRecord, CreateWebhookLogDTO } from '@/shared/types/models';

export const WEBHOOK_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PRUNE_EVERY_N_WRITES = 50;

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

    this.maybePrune(db);

    return log as WebhookLogRecord;
  }

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

  async pruneOlderThan(cutoffIso: string): Promise<number> {
    const db = await getDrizzle();

    const deleted = await db
      .delete(webhookLogs)
      .where(lt(webhookLogs.created_at, cutoffIso))
      .returning({ id: webhookLogs.id });

    return deleted.length;
  }

  async getRevision(projectId: string): Promise<{ count: number; maxCreated: string | null }> {
    const db = await getDrizzle();

    const [row] = await db
      .select({
        count: sql<number>`cast(count(*) as integer)`,
        maxCreated: sql<string | null>`max(${webhookLogs.created_at})`,
      })
      .from(webhookLogs)
      .where(eq(webhookLogs.project_id, projectId));

    return {
      count: Number(row?.count) || 0,
      maxCreated: row?.maxCreated ?? null,
    };
  }
}
