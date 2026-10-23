import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { generateWebhookLogId } from '@/shared/utils/id';
import { logger } from '@/shared/logger';
import { toInvoiceStatusResponse } from '@/shared/services/invoice-mapper';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { hmacSha256Hex } from '@/server/auth/project-token';
import type { InvoiceRecord, WebhookLogRecord } from '@/shared/types/models';

/**
 * The maximum size of the body Paymock sends.
 *
 * A merchant webhook payload is small by construction; a payload above this
 * limit is a sign of a malformed invoice rather than a legitimate delivery.
 */
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

/**
 * The maximum size of the response body that is read from the receiver.
 *
 * Without a cap a hostile (or broken) endpoint could stream an arbitrary
 * amount of data into the isolate's memory.
 */
export const MAX_WEBHOOK_RESPONSE_BYTES = 8 * 1024;

/** The maximum number of redirects that are followed. */
export const MAX_WEBHOOK_REDIRECTS = 1;

/**
 * Reads at most `maxBytes` from a response body.
 */
async function readBodyCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - total;
      if (value.length > remaining) {
        chunks.push(value.slice(0, remaining));
        total += remaining;
        truncated = true;
        break;
      }

      chunks.push(value);
      total += value.length;
    }
  } finally {
    // Cancel the stream so the connection is released instead of being
    // drained in the background.
    await reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const text = new TextDecoder().decode(merged);
  return truncated ? `${text}…[truncated]` : text;
}

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

/**
 * Dispatches a webhook and records the delivery attempt.
 *
 * Returns the created log so callers can report the delivery result without
 * re-reading it from the database — the previous `Promise<void>` signature
 * forced every caller into an extra SELECT of `request_body` + `response_body`.
 */
export async function sendWebhook(invoice: InvoiceRecord): Promise<WebhookLogRecord> {
  const webhooksRepo = new WebhooksRepository();
  const projectsRepo = new ProjectsRepository();
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

      return webhooksRepo.createLog({
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
    }

    if (new TextEncoder().encode(requestBody).length > MAX_WEBHOOK_BODY_BYTES) {
      logger.warn({
        event: 'webhook_blocked_too_large',
        invoiceId: invoice.id,
        projectId: invoice.project_id,
      });

      return webhooksRepo.createLog({
        id: logId,
        projectId: invoice.project_id,
        invoiceId: invoice.id,
        url: invoice.webhook_url,
        statusCode: 413,
        requestBody: '[payload too large]',
        responseBody: 'Payload exceeded the maximum webhook body size',
        durationMs: 0,
        error: 'PAYLOAD_TOO_LARGE',
      });
    }

    // The signing secret of the project. A webhook without a signature cannot
    // be distinguished from a forgery by the receiver, so every delivery is
    // signed with HMAC-SHA256 over the exact body that is sent.
    const webhookSecret = await projectsRepo.findWebhookSecret(invoice.project_id);
    const signature = webhookSecret
      ? await hmacSha256Hex(webhookSecret, requestBody)
      : null;

    try {
      let currentUrl = invoice.webhook_url;
      let res = await fetch(currentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Paymock-Webhook-Dispatcher/1.0',
          'X-Paymock-Event': 'invoice.status_changed',
          ...(signature ? { 'X-Paymock-Signature': `sha256=${signature}` } : {}),
        },
        body: requestBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(7000),
      });

      // At most one redirect is followed, and the new target is validated
      // against the SSRF filter again — a redirect is an attacker-controlled
      // destination just like the original URL.
      let redirects = 0;
      while (
        res.status >= 300 &&
        res.status < 400 &&
        redirects < MAX_WEBHOOK_REDIRECTS &&
        res.headers.get('location')
      ) {
        const location = res.headers.get('location')!;
        let nextUrl: string;
        try {
          nextUrl = new URL(location, currentUrl).toString();
        } catch {
          errorMsg = 'redirect target is not a valid URL';
          break;
        }

        if (!isSafeWebhookUrl(nextUrl)) {
          logger.warn({
            event: 'webhook_blocked_ssrf',
            url: nextUrl,
            invoiceId: invoice.id,
          });
          errorMsg = 'redirect target blocked by SSRF protection filter';
          break;
        }

        currentUrl = nextUrl;
        redirects += 1;

        res = await fetch(currentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Paymock-Webhook-Dispatcher/1.0',
            'X-Paymock-Event': 'invoice.status_changed',
            ...(signature ? { 'X-Paymock-Signature': `sha256=${signature}` } : {}),
          },
          body: requestBody,
          redirect: 'manual',
          signal: AbortSignal.timeout(7000),
        });
      }

      statusCode = res.status;
      responseBody = await readBodyCapped(res, MAX_WEBHOOK_RESPONSE_BYTES);

      if (!res.ok && !errorMsg) {
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

  const log = await webhooksRepo.createLog({
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

  return log;
}

/**
 * Dispatches a webhook without blocking the response.
 *
 * On Cloudflare Workers a plain `sendWebhook(...)` without `await` is unsafe:
 * the isolate is frozen as soon as the response is returned, which silently
 * drops both the HTTP call and the `webhook_logs` INSERT. `waitUntil` keeps
 * the task alive past the response instead.
 *
 * `waitUntil` must be registered **synchronously** — the isolate is frozen
 * right after the response is sent, so an awaited lookup could land too late.
 * The synchronous context accessor is therefore used, with an awaited task as
 * the fallback for runtimes without an ExecutionContext (Node, tests).
 */
export function dispatchWebhook(invoice: InvoiceRecord): void {
  const task = sendWebhook(invoice).catch((err: unknown) => {
    logger.error({
      event: 'webhook_dispatch_failed',
      invoiceId: invoice.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  try {
    const context = getCloudflareContext({ async: false });
    // OpenNext exposes the Workers ExecutionContext as `ctx.ctx`.
    // `waitUntil` must be invoked as a method — extracting it into a variable
    // loses the `this` binding and Workers rejects the call with
    // "Illegal invocation".
    if (typeof context?.ctx?.waitUntil === 'function') {
      context.ctx.waitUntil(task);
      logger.info({ event: 'webhook_dispatched_deferred', invoiceId: invoice.id });
      return;
    }
    logger.warn({ event: 'webhook_waituntil_unavailable', invoiceId: invoice.id });
  } catch (err) {
    logger.warn({
      event: 'webhook_waituntil_unavailable',
      invoiceId: invoice.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  void task;
}
