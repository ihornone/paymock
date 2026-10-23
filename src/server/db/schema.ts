import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { InvoiceStatus, PaymentType } from '@/shared/types/acquiring';

/**
 * 1. Projects Table (Merchants / Multi-tenant stores)
 *
 * Two columns carry secrets and are never selected into an API response:
 *  - `token_hash` — the SHA-256 of the merchant token. The plaintext token
 *    exists only in the response of the call that creates or rotates it;
 *  - `webhook_secret` — the HMAC key used to sign outgoing webhooks.
 *
 * `user_id` is NOT NULL: every project belongs to exactly one account, so an
 * owner-less row can never be listed, used or audited.
 */
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull(),
    name: text('name').notNull(),
    token_hash: text('token_hash').notNull().unique(),
    webhook_secret: text('webhook_secret').notNull(),
    edrpou: text('edrpou').notNull().default('12345678'),
    logo_url: text('logo_url'),
    default_webhook_url: text('default_webhook_url'),
    default_success_url: text('default_success_url'),
    default_fail_url: text('default_fail_url'),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_projects_token_hash').on(table.token_hash),
    index('idx_projects_user_id').on(table.user_id),
  ]
);

/**
 * 2. Invoices Table (Payment Invoices)
 */
export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    ccy: integer('ccy').notNull().default(980),
    final_amount: integer('final_amount'),
    status: text('status').$type<InvoiceStatus>().notNull().default('created'),
    payment_type: text('payment_type').$type<PaymentType>().default('debit'),
    reference: text('reference'),
    destination: text('destination'),
    comment: text('comment'),
    basket_json: text('basket_json'),
    redirect_url: text('redirect_url'),
    success_url: text('success_url'),
    fail_url: text('fail_url'),
    webhook_url: text('webhook_url'),
    validity: integer('validity').default(900),
    failure_reason: text('failure_reason'),
    err_code: text('err_code'),
    payment_info_json: text('payment_info_json'),
    cancel_list_json: text('cancel_list_json'),
    created_date: text('created_date').notNull(),
    modified_date: text('modified_date').notNull(),
  },
  (table) => [
    index('idx_invoices_project').on(table.project_id),
    index('idx_invoices_status').on(table.status),
    // Composite index for the dashboard hot path:
    //   WHERE project_id = ? ORDER BY created_date DESC LIMIT n
    // Without it SQLite sorts every matching row in a TEMP B-TREE before
    // applying LIMIT — measured 192x slower at 100k invoices per project.
    index('idx_invoices_project_created').on(table.project_id, table.created_date),
  ]
);

/**
 * 3. Webhook Logs Table (Delivery audit log)
 */
export const webhookLogs = sqliteTable(
  'webhook_logs',
  {
    id: text('id').primaryKey(),
    project_id: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    invoice_id: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    status_code: integer('status_code'),
    request_body: text('request_body').notNull(),
    response_body: text('response_body'),
    duration_ms: integer('duration_ms'),
    error: text('error'),
    created_at: text('created_at').notNull(),
  },
  (table) => [
    index('idx_webhook_logs_invoice').on(table.invoice_id),
    index('idx_webhook_logs_project').on(table.project_id),
    // Same composite pattern as `invoices` — the dashboard webhook feed is
    // also `WHERE project_id = ? ORDER BY created_at DESC LIMIT n`.
    index('idx_webhook_logs_project_created').on(table.project_id, table.created_at),
  ]
);

/**
 * 4. Personal Access Tokens Table
 *
 * The MCP server and the account-wide API are authenticated with a personal
 * access token. The token itself is never stored — only its SHA-256 hash —
 * so a database leak cannot be replayed against the API.
 */
export const personalAccessTokens = sqliteTable(
  'personal_access_tokens',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id').notNull(),
    token_hash: text('token_hash').notNull().unique(),
    name: text('name').notNull().default('default'),
    created_at: text('created_at').notNull(),
    last_used_at: text('last_used_at'),
    revoked_at: text('revoked_at'),
  },
  (table) => [
    index('idx_pat_user_id').on(table.user_id),
    index('idx_pat_token_hash').on(table.token_hash),
  ]
);

/**
 * 5. Audit Log
 *
 * Every state-changing operation leaves a row here: who did it, from where,
 * against which target and with which result. Anonymous attempts are logged
 * too — they are the interesting ones.
 */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    created_at: text('created_at').notNull(),
    actor_user_id: text('actor_user_id'),
    actor_kind: text('actor_kind').notNull(),
    action: text('action').notNull(),
    target_type: text('target_type'),
    target_id: text('target_id'),
    ip: text('ip'),
    user_agent: text('user_agent'),
    result: text('result').notNull(),
    detail: text('detail'),
  },
  (table) => [
    index('idx_audit_log_created').on(table.created_at),
    index('idx_audit_log_actor').on(table.actor_user_id),
    index('idx_audit_log_action').on(table.action),
  ]
);

export type AuditLogRecord = typeof auditLog.$inferSelect;

/**
 * Relational definitions for Drizzle Query API
 */
export const projectsRelations = relations(projects, ({ many }) => ({
  invoices: many(invoices),
  webhookLogs: many(webhookLogs),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  project: one(projects, {
    fields: [invoices.project_id],
    references: [projects.id],
  }),
  webhookLogs: many(webhookLogs),
}));

export const webhookLogsRelations = relations(webhookLogs, ({ one }) => ({
  project: one(projects, {
    fields: [webhookLogs.project_id],
    references: [projects.id],
  }),
  invoice: one(invoices, {
    fields: [webhookLogs.invoice_id],
    references: [invoices.id],
  }),
}));

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProjectRecord = typeof projects.$inferInsert;

export type InvoiceDbRecord = typeof invoices.$inferSelect;
export type NewInvoiceDbRecord = typeof invoices.$inferInsert;

export type WebhookLogDbRecord = typeof webhookLogs.$inferSelect;
export type NewWebhookLogDbRecord = typeof webhookLogs.$inferInsert;
