import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { generateWebhookLogId } from '@/src/shared/utils/id';
import { logger } from '@/src/shared/logger';
import type { InvoiceRecord } from '@/src/types/models';
import type { InvoiceStatusResponse } from '@/src/types/acquiring';

export async function sendWebhook(invoice: InvoiceRecord): Promise<void> {
  const webhooksRepo = new WebhooksRepository();
  const logId = generateWebhookLogId();
  const startTime = Date.now();

  const payload: InvoiceStatusResponse = {
    invoiceId: invoice.id,
    status: invoice.status,
    failureReason: invoice.failure_reason || undefined,
    errCode: invoice.err_code || undefined,
    amount: invoice.amount,
    ccy: invoice.ccy,
    finalAmount: invoice.final_amount || invoice.amount,
    createdDate: invoice.created_date,
    modifiedDate: invoice.modified_date,
    reference: invoice.reference || undefined,
    destination: invoice.destination || undefined,
    cancelList: invoice.cancel_list_json ? JSON.parse(invoice.cancel_list_json) : undefined,
    paymentInfo: invoice.payment_info_json ? JSON.parse(invoice.payment_info_json) : undefined,
  };

  const requestBody = JSON.stringify(payload);
  const targetUrl = invoice.webhook_url || '— (URL не вказано в запиті)';
  let statusCode: number | null = 200;
  let responseBody: string | null = null;
  let errorMsg: string | null = null;

  if (invoice.webhook_url) {
    try {
      const res = await fetch(invoice.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Paymock-Webhook-Dispatcher/1.0',
        },
        body: requestBody,
        signal: AbortSignal.timeout(7000),
      });

      statusCode = res.status;
      const text = await res.text();
      responseBody = text.slice(0, 2048);

      if (!res.ok) {
        errorMsg = `remote server returned HTTP ${res.status}`;
      }
    } catch (err: any) {
      statusCode = 500;
      errorMsg = err.name === 'TimeoutError' ? 'webhook request timed out (7s)' : err.message;
    }
  } else {
    // Sandbox simulation: URL was not specified by merchant, log simulated delivery
    statusCode = 200;
    responseBody = JSON.stringify({ status: 'ok', simulated: true, note: 'Paymock Sandbox: delivery simulated because webhook_url was not provided' });
  }

  const durationMs = Math.max(1, Date.now() - startTime);

  await webhooksRepo.createLog({
    id: logId,
    projectId: invoice.project_id,
    invoiceId: invoice.id,
    url: targetUrl,
    statusCode,
    requestBody,
    responseBody,
    durationMs,
    error: errorMsg,
  });

  logger.info({
    event: 'webhook_dispatched',
    invoiceId: invoice.id,
    targetUrl,
    statusCode: statusCode ?? undefined,
    durationMs,
    error: errorMsg || undefined,
  });
}
