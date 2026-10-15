import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { generateWebhookLogId } from '@/src/shared/utils/id';
import { logger } from '@/src/shared/logger';
import { toInvoiceStatusResponse } from '@/src/services/invoice-mapper';
import type { InvoiceRecord } from '@/src/types/models';

/**
 * Validates whether a target URL is safe for webhook dispatching (SSRF protection).
 */
export function isSafeWebhookUrl(inputUrl: string): boolean {
  try {
    const url = new URL(inputUrl);

    // 1. Only allow HTTP and HTTPS
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // 2. Disallow local and loopback addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return false;
    }

    // 3. Disallow cloud metadata IP (AWS, GCP, DigitalOcean, Cloudflare)
    if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
      return false;
    }

    // 4. In production, disallow private IP ranges (RFC 1918)
    if (process.env.NODE_ENV === 'production') {
      if (hostname.startsWith('10.')) return false;
      if (hostname.startsWith('192.168.')) return false;
      const match172 = hostname.match(/^172\.(\d+)\./);
      if (match172) {
        const secondOctet = parseInt(match172[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function sendWebhook(invoice: InvoiceRecord): Promise<void> {
  const webhooksRepo = new WebhooksRepository();
  const logId = generateWebhookLogId();
  const startTime = Date.now();

  const payload = toInvoiceStatusResponse(invoice);

  const requestBody = JSON.stringify(payload);
  const targetUrl = invoice.webhook_url || '— (URL не вказано в запиті)';
  let statusCode: number | null = 200;
  let responseBody: string | null = null;
  let errorMsg: string | null = null;

  if (invoice.webhook_url) {
    if (!isSafeWebhookUrl(invoice.webhook_url)) {
      logger.warn({
        event: 'webhook_blocked_ssrf',
        url: invoice.webhook_url,
        invoiceId: invoice.id,
      });

      await webhooksRepo.createLog({
        id: logId,
        projectId: invoice.project_id,
        invoiceId: invoice.id,
        url: invoice.webhook_url,
        statusCode: 400,
        requestBody,
        responseBody: 'Blocked by SSRF protection filter (untrusted or private destination URL)',
        durationMs: 0,
        error: 'BLOCKED_BY_SSRF_PROTECTION',
      });
      return;
    }

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
    responseBody = JSON.stringify({
      status: 'ok',
      simulated: true,
      note: 'Paymock Sandbox: delivery simulated because webhook_url was not provided',
    });
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
  });
}
