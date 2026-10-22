import { eq, and, desc, sql } from 'drizzle-orm';
import { getDrizzle } from './drizzle';
import { invoices } from './schema';
import { projects } from './schema';
import { clampLimit, clampOffset, DEFAULT_PAGE_SIZE } from '@/shared/utils/pagination';
import type { InvoiceRecord, InvoiceStats } from '@/shared/types/models';
import type { InvoiceStatus, PaymentInfo, CancelItem, PaymentType } from '@/shared/types/acquiring';

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

/**
 * Columns the dashboard actually renders. Reading the full 22-column row pulls
 * `basket_json`, `payment_info_json` and `cancel_list_json` over the wire for
 * nothing — measured at 69% dead weight in the response payload.
 *
 * Aliases keep the public API response shape (snake_case) unchanged.
 */
export const DASHBOARD_INVOICE_COLUMNS = {
  id: invoices.id,
  project_id: invoices.project_id,
  amount: invoices.amount,
  ccy: invoices.ccy,
  status: invoices.status,
  payment_type: invoices.payment_type,
  reference: invoices.reference,
  destination: invoices.destination,
  created_date: invoices.created_date,
} as const;

export type DashboardInvoice = {
  id: string;
  project_id: string;
  amount: number;
  ccy: number;
  status: InvoiceStatus;
  payment_type: PaymentType | null;
  reference: string | null;
  destination: string | null;
  created_date: string;
};


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

    const limit = clampLimit(options.limit, DEFAULT_PAGE_SIZE);
    const offset = clampOffset(options.offset);

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

  /**
   * Narrow projection for the dashboard feed. Same rows, 9 columns instead of 22.
   */
  async listForDashboard(
    projectId: string,
    limit: number
  ): Promise<DashboardInvoice[]> {
    const db = await getDrizzle();

    const results = await db
      .select(DASHBOARD_INVOICE_COLUMNS)
      .from(invoices)
      .where(eq(invoices.project_id, projectId))
      .orderBy(desc(invoices.created_date))
      .limit(clampLimit(limit, DEFAULT_PAGE_SIZE));

    return results as DashboardInvoice[];
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
    } = {},
    /**
     * The row the caller already loaded. Supplying it removes a redundant
     * full-row SELECT from every status transition.
     */
    existing?: InvoiceRecord | null
  ): Promise<InvoiceRecord | null> {
    const db = await getDrizzle();

    let current = existing;
    if (current === undefined) {
      const [row] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, id))
        .limit(1);
      current = row;
    }

    if (!current) return null;
    const existingRow = current;

    const now = new Date().toISOString();
    let paymentInfoJson = existingRow.payment_info_json;
    if (options.paymentInfo) {
      paymentInfoJson = JSON.stringify(options.paymentInfo);
    }

    let cancelListJson = existingRow.cancel_list_json;
    if (options.cancelItem) {
      const currentList: CancelItem[] = existingRow.cancel_list_json
        ? JSON.parse(existingRow.cancel_list_json)
        : [];
      currentList.push(options.cancelItem);
      cancelListJson = JSON.stringify(currentList);
    }

    const finalAmount =
      options.finalAmount !== undefined ? options.finalAmount : existingRow.final_amount;

    const [updated] = await db
      .update(invoices)
      .set({
        status,
        final_amount: finalAmount ?? null,
        failure_reason: options.failureReason ?? existingRow.failure_reason ?? null,
        err_code: options.errCode ?? existingRow.err_code ?? null,
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

  /**
   * Aggregate statistics scoped to the owning user.
   *
   * The ownership check lives in the JOIN rather than in a separate
   * `findById` call, so the whole read costs one query instead of two.
   * Returns `null` when the user does not own the project.
   */
  async countStatsForUser(
    projectId: string,
    userId: string
  ): Promise<InvoiceStats | null> {
    const db = await getDrizzle();
    const rows = await db
      .select({
        status: invoices.status,
        count: sql<number>`cast(count(*) as integer)`,
        sum: sql<number>`cast(sum(${invoices.amount}) as integer)`,
      })
      .from(invoices)
      .innerJoin(projects, eq(projects.id, invoices.project_id))
      .where(and(eq(invoices.project_id, projectId), eq(projects.user_id, userId)))
      .groupBy(invoices.status);

    // No rows can mean "no invoices" or "not your project" — distinguish with a
    // cheap ownership probe only in the empty case.
    if (rows.length === 0) {
      const owned = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
        .limit(1);
      if (owned.length === 0) return null;
    }

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

  /**
   * Most recent invoices of a project, scoped to the owning user in a single
   * JOIN query.
   */
  async listRecentForUser(
    projectId: string,
    userId: string,
    limit: number
  ): Promise<InvoiceRecord[] | null> {
    const db = await getDrizzle();

    const rows = await db
      .select({ invoice: invoices })
      .from(invoices)
      .innerJoin(projects, eq(projects.id, invoices.project_id))
      .where(and(eq(invoices.project_id, projectId), eq(projects.user_id, userId)))
      .orderBy(desc(invoices.created_date))
      .limit(clampLimit(limit, DEFAULT_PAGE_SIZE));

    if (rows.length === 0) {
      const owned = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.user_id, userId)))
        .limit(1);
      if (owned.length === 0) return null;
    }

    return rows.map((row) => row.invoice) as InvoiceRecord[];
  }
}
