import { getDb } from './db';
import type { WebhookLogRecord, CreateWebhookLogDTO } from '@/src/types/models';

export class WebhooksRepository {
  async createLog(dto: CreateWebhookLogDTO): Promise<WebhookLogRecord> {
    const db = await getDb();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO webhook_logs (
        id, project_id, invoice_id, url, status_code,
        request_body, response_body, duration_ms, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.id,
        dto.projectId,
        dto.invoiceId,
        dto.url,
        dto.statusCode ?? null,
        dto.requestBody,
        dto.responseBody ?? null,
        dto.durationMs ?? null,
        dto.error ?? null,
        now,
      ]
    );

    const log = await db.queryFirst<WebhookLogRecord>('SELECT * FROM webhook_logs WHERE id = ?', [dto.id]);
    return log!;
  }

  async list(options: { projectId?: string; invoiceId?: string; limit?: number } = {}): Promise<WebhookLogRecord[]> {
    const db = await getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.projectId) {
      conditions.push('project_id = ?');
      params.push(options.projectId);
    }
    if (options.invoiceId) {
      conditions.push('invoice_id = ?');
      params.push(options.invoiceId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;

    return db.queryAll<WebhookLogRecord>(
      `SELECT * FROM webhook_logs ${where} ORDER BY created_at DESC LIMIT ?`,
      [...params, limit]
    );
  }
}
