import { getDb } from './db';
import type { InvoiceRecord, InvoiceStats } from '@/src/types/models';
import type { InvoiceStatus, PaymentInfo, CancelItem } from '@/src/types/acquiring';

export interface CreateInvoiceDTO {
  id: string;
  projectId: string;
  amount: number;
  ccy?: number;
  paymentType?: string;
  reference?: string;
  destination?: string;
  comment?: string;
  basketJson?: string | null;
  redirectUrl?: string;
  successUrl?: string;
  failUrl?: string;
  webhookUrl?: string;
  validity?: number;
}

export class InvoicesRepository {
  async findById(id: string): Promise<InvoiceRecord | null> {
    const db = await getDb();
    const invoice = await db.queryFirst<InvoiceRecord>('SELECT * FROM invoices WHERE id = ?', [id]);
    if (!invoice) return null;

    // Check if invoice has exceeded its validity (default 900s / 15 minutes)
    if (invoice.status === 'created' && invoice.created_date) {
      const validitySec = invoice.validity || 900;
      const createdAtMs = new Date(invoice.created_date).getTime();
      const expiresAtMs = createdAtMs + validitySec * 1000;

      if (Date.now() > expiresAtMs) {
        await db.execute(
          `UPDATE invoices SET
            status = 'expired',
            failure_reason = 'Час дії рахунку вичерпано (15 хв)',
            modified_date = ?
          WHERE id = ?`,
          [new Date().toISOString(), invoice.id]
        );

        return db.queryFirst<InvoiceRecord>('SELECT * FROM invoices WHERE id = ?', [id]);
      }
    }

    return invoice;
  }

  async list(options: { projectId?: string; status?: InvoiceStatus; limit?: number; offset?: number } = {}): Promise<InvoiceRecord[]> {
    const db = await getDb();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.projectId) {
      conditions.push('project_id = ?');
      params.push(options.projectId);
    }
    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const query = `SELECT * FROM invoices ${where} ORDER BY created_date DESC LIMIT ? OFFSET ?`;
    return db.queryAll<InvoiceRecord>(query, [...params, limit, offset]);
  }

  async create(dto: CreateInvoiceDTO): Promise<InvoiceRecord> {
    const db = await getDb();
    const now = new Date().toISOString();

    await db.execute(
      `INSERT INTO invoices (
        id, project_id, amount, ccy, final_amount, status, payment_type,
        reference, destination, comment, basket_json,
        redirect_url, success_url, fail_url, webhook_url,
        validity, created_date, modified_date
      ) VALUES (
        ?, ?, ?, ?, ?, 'created', ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )`,
      [
        dto.id,
        dto.projectId,
        dto.amount,
        dto.ccy ?? 980,
        dto.amount,
        dto.paymentType ?? 'debit',
        dto.reference || null,
        dto.destination || null,
        dto.comment || null,
        dto.basketJson || null,
        dto.redirectUrl || null,
        dto.successUrl || null,
        dto.failUrl || null,
        dto.webhookUrl || null,
        dto.validity ?? 900,
        now,
        now,
      ]
    );

    const record = await this.findById(dto.id);
    return record!;
  }

  async updateStatus(
    id: string,
    status: InvoiceStatus,
    options: {
      finalAmount?: number;
      failureReason?: string;
      errCode?: string;
      paymentInfo?: PaymentInfo;
      cancelItem?: CancelItem;
    } = {}
  ): Promise<InvoiceRecord | null> {
    const db = await getDb();
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    let paymentInfoJson = existing.payment_info_json;
    if (options.paymentInfo) {
      paymentInfoJson = JSON.stringify(options.paymentInfo);
    }

    let cancelListJson = existing.cancel_list_json;
    if (options.cancelItem) {
      const currentList: CancelItem[] = existing.cancel_list_json
        ? JSON.parse(existing.cancel_list_json)
        : [];
      currentList.push(options.cancelItem);
      cancelListJson = JSON.stringify(currentList);
    }

    const finalAmount = options.finalAmount !== undefined ? options.finalAmount : existing.final_amount;

    await db.execute(
      `UPDATE invoices SET
        status = ?,
        final_amount = ?,
        failure_reason = ?,
        err_code = ?,
        payment_info_json = ?,
        cancel_list_json = ?,
        modified_date = ?
      WHERE id = ?`,
      [
        status,
        finalAmount ?? null,
        options.failureReason ?? existing.failure_reason ?? null,
        options.errCode ?? existing.err_code ?? null,
        paymentInfoJson ?? null,
        cancelListJson ?? null,
        now,
        id,
      ]
    );

    return this.findById(id);
  }

  async countStats(projectId: string): Promise<InvoiceStats> {
    const db = await getDb();
    const rows = await db.queryAll<{ status: string; count: number; sum: number | null }>(
      `SELECT status, COUNT(*) as count, SUM(amount) as sum
       FROM invoices
       WHERE project_id = ?
       GROUP BY status`,
      [projectId]
    );

    let totalAmount = 0;
    let totalCount = 0;
    let successCount = 0;
    let failureCount = 0;
    let createdCount = 0;

    for (const row of rows) {
      const count = Number(row.count) || 0;
      const sum = Number(row.sum) || 0;

      totalCount += count;
      if (row.status === 'success') {
        successCount += count;
        totalAmount += sum;
      } else if (row.status === 'failure') {
        failureCount += count;
      } else if (row.status === 'created' || row.status === 'processing') {
        createdCount += count;
      }
    }

    return {
      totalAmount,
      totalCount,
      successCount,
      failureCount,
      createdCount,
    };
  }
}
