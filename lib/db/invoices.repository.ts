import { eq, and, desc, sql } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { invoices } from './schema';
import type { InvoiceRecord, InvoiceStats } from '@/src/types/models';
import type { InvoiceStatus, PaymentInfo, CancelItem, PaymentType } from '@/src/types/acquiring';

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
    const db = await getDrizzle();
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

    if (!invoice) return null;

    // Check if invoice has exceeded its validity (default 900s / 15 minutes)
    if (invoice.status === 'created' && invoice.created_date) {
      const validitySec = invoice.validity || 900;
      const createdAtMs = new Date(invoice.created_date).getTime();
      const expiresAtMs = createdAtMs + validitySec * 1000;

      if (Date.now() > expiresAtMs) {
        const now = new Date().toISOString();
        const [expired] = await db
          .update(invoices)
          .set({
            status: 'expired',
            failure_reason: 'Час дії рахунку вичерпано (15 хв)',
            modified_date: now,
          })
          .where(eq(invoices.id, invoice.id))
          .returning();

        return (expired as InvoiceRecord) || null;
      }
    }

    return invoice as InvoiceRecord;
  }

  async list(
    options: {
      projectId?: string;
      status?: InvoiceStatus;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<InvoiceRecord[]> {
    const db = await getDrizzle();
    const conditions = [];

    if (options.projectId) {
      conditions.push(eq(invoices.project_id, options.projectId));
    }
    if (options.status) {
      conditions.push(eq(invoices.status, options.status));
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db
      .select()
      .from(invoices)
      .where(whereClause)
      .orderBy(desc(invoices.created_date))
      .limit(limit)
      .offset(offset);

    return results as InvoiceRecord[];
  }

  async create(dto: CreateInvoiceDTO): Promise<InvoiceRecord> {
    const db = await getDrizzle();
    const now = new Date().toISOString();

    const [record] = await db
      .insert(invoices)
      .values({
        id: dto.id,
        project_id: dto.projectId,
        amount: dto.amount,
        ccy: dto.ccy ?? 980,
        final_amount: dto.amount,
        status: 'created',
        payment_type: (dto.paymentType as PaymentType) ?? 'debit',
        reference: dto.reference || null,
        destination: dto.destination || null,
        comment: dto.comment || null,
        basket_json: dto.basketJson || null,
        redirect_url: dto.redirectUrl || null,
        success_url: dto.successUrl || null,
        fail_url: dto.failUrl || null,
        webhook_url: dto.webhookUrl || null,
        validity: dto.validity ?? 900,
        created_date: now,
        modified_date: now,
      })
      .returning();

    return record as InvoiceRecord;
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
    const db = await getDrizzle();
    const [existing] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);

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

    const finalAmount =
      options.finalAmount !== undefined ? options.finalAmount : existing.final_amount;

    const [updated] = await db
      .update(invoices)
      .set({
        status,
        final_amount: finalAmount ?? null,
        failure_reason: options.failureReason ?? existing.failure_reason ?? null,
        err_code: options.errCode ?? existing.err_code ?? null,
        payment_info_json: paymentInfoJson ?? null,
        cancel_list_json: cancelListJson ?? null,
        modified_date: now,
      })
      .where(eq(invoices.id, id))
      .returning();

    return (updated as InvoiceRecord) || null;
  }

  async countStats(projectId: string): Promise<InvoiceStats> {
    const db = await getDrizzle();
    const rows = await db
      .select({
        status: invoices.status,
        count: sql<number>`cast(count(*) as integer)`,
        sum: sql<number>`cast(sum(${invoices.amount}) as integer)`,
      })
      .from(invoices)
      .where(eq(invoices.project_id, projectId))
      .groupBy(invoices.status);

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
