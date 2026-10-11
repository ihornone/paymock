import type { InvoiceStatus, PaymentType } from './monobank';

export interface Project {
  id: string;
  name: string;
  token: string;
  edrpou: string;
  logo_url?: string | null;
  default_webhook_url: string | null;
  default_success_url: string | null;
  default_fail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
  id: string;
  project_id: string;
  amount: number;
  ccy: number;
  final_amount: number | null;
  status: InvoiceStatus;
  payment_type: PaymentType;
  reference: string | null;
  destination: string | null;
  comment: string | null;
  basket_json: string | null;
  redirect_url: string | null;
  success_url: string | null;
  fail_url: string | null;
  webhook_url: string | null;
  validity: number;
  failure_reason: string | null;
  err_code: string | null;
  payment_info_json: string | null;
  cancel_list_json: string | null;
  created_date: string;
  modified_date: string;
}

export interface WebhookLogRecord {
  id: string;
  project_id: string;
  invoice_id: string;
  url: string;
  status_code: number | null;
  request_body: string;
  response_body: string | null;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
}

export interface InvoiceStats {
  totalCount: number;
  totalAmount: number;
  successCount: number;
  failureCount: number;
  createdCount: number;
}

export interface CreateProjectDTO {
  name: string;
  edrpou?: string;
  defaultWebhookUrl?: string;
  defaultSuccessUrl?: string;
  defaultFailUrl?: string;
}

export interface CreateWebhookLogDTO {
  id: string;
  projectId: string;
  invoiceId: string;
  url: string;
  statusCode?: number | null;
  requestBody: string;
  responseBody?: string | null;
  durationMs?: number | null;
  error?: string | null;
}
