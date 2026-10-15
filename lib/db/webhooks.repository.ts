import { eq, and, desc } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { webhookLogs } from './schema';
import type { WebhookLogRecord, CreateWebhookLogDTO } from '@/src/types/models';

export class WebhooksRepository {
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

    return log as WebhookLogRecord;
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
    const limit = options.limit || 50;

    const results = await db
      .select()
      .from(webhookLogs)
      .where(whereClause)
      .orderBy(desc(webhookLogs.created_at))
      .limit(limit);

    return results as WebhookLogRecord[];
  }
}
