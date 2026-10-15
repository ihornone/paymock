import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { sendWebhook, isSafeWebhookUrl } from '@/lib/webhook';
import { resolveTargetProject } from './projects.handler';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface WebhooksHandlerContext {
  userId: string;
  projectsRepo: ProjectsRepository;
  invoicesRepo: InvoicesRepository;
  webhooksRepo: WebhooksRepository;
}

export async function handleSimulatePayment(
  args: any,
  { userId, projectsRepo, invoicesRepo, webhooksRepo }: WebhooksHandlerContext
): Promise<CallToolResult> {
  const { invoiceId, action, failureReason } = args || {};
  if (!invoiceId || !action) throw new Error('Параметри invoiceId та action обов\'язкові.');

  const invoice = await invoicesRepo.findById(invoiceId);
  if (!invoice) {
    throw new Error(`Рахунок ${invoiceId} не знайдено.`);
  }

  // Verify project ownership
  const project = await projectsRepo.findById(invoice.project_id, userId);
  if (!project) {
    throw new Error(`Немає доступу до рахунку ${invoiceId}.`);
  }

  let newStatus: any = 'created';
  let paymentInfo: any = null;

  if (action === 'success') {
    newStatus = 'success';
    paymentInfo = {
      maskedPan: '4441 11** **** 1234',
      approvalCode: '857321',
      rrn: '104857291048',
      paymentMethod: 'pan',
      paymentSystem: 'Visa',
      country: 'Ukraine',
      fee: 0,
    };
  } else if (action === 'failure') {
    newStatus = 'failure';
  } else if (action === 'expired') {
    newStatus = 'expired';
  }

  const updated = await invoicesRepo.updateStatus(invoiceId, newStatus, {
    paymentInfo,
    failureReason: failureReason || (action === 'failure' ? 'Платіж відхилено' : undefined),
    errCode: action === 'failure' ? 'PAYMENT_DECLINED' : undefined,
  });

  let webhookStatusText = 'вебхук не налаштовано';
  if (updated && updated.webhook_url) {
    await sendWebhook(updated);
    const [latestLog] = await webhooksRepo.list({ projectId: project.id, invoiceId, limit: 1 });
    if (latestLog) {
      webhookStatusText = `надіслано на ${updated.webhook_url} (HTTP ${latestLog.status_code || 'Err'}, ${latestLog.duration_ms ?? 0}ms)`;
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `✅ Статус рахунку ${invoiceId} оновлено на [${newStatus}].\nWebhook: ${webhookStatusText}.`,
      },
    ],
  };
}

export async function handleGetWebhookLogs(
  args: any,
  { userId, projectsRepo, webhooksRepo }: WebhooksHandlerContext
): Promise<CallToolResult> {
  const { projectId, invoiceId, limit = 15 } = args || {};

  let targetProjectId = projectId;
  if (!targetProjectId) {
    const project = await resolveTargetProject(undefined, userId, projectsRepo);
    targetProjectId = project.id;
  } else {
    await resolveTargetProject(targetProjectId, userId, projectsRepo);
  }

  const logs = await webhooksRepo.list({
    projectId: targetProjectId,
    invoiceId,
    limit: Number(limit),
  });

  return {
    content: [{ type: 'text', text: JSON.stringify(logs, null, 2) }],
  };
}

export async function handleRetryWebhook(
  args: any,
  { userId, projectsRepo, invoicesRepo, webhooksRepo }: WebhooksHandlerContext
): Promise<CallToolResult> {
  const { invoiceId, customUrl } = args || {};
  if (!invoiceId) throw new Error('Потрібно вказати invoiceId.');

  const invoice = await invoicesRepo.findById(invoiceId);
  if (!invoice) {
    throw new Error(`Рахунок ${invoiceId} не знайдено.`);
  }

  const project = await projectsRepo.findById(invoice.project_id, userId);
  if (!project) {
    throw new Error(`Рахунок ${invoiceId} не належить вашому акаунту.`);
  }

  const targetUrl = customUrl || invoice.webhook_url;
  if (!targetUrl) throw new Error('Не вказано webhook_url.');

  if (!isSafeWebhookUrl(targetUrl)) {
    throw new Error('Небезпечний або невалідний URL вебхука (блокування SSRF).');
  }

  const invoiceToSend = customUrl ? { ...invoice, webhook_url: customUrl } : invoice;
  await sendWebhook(invoiceToSend);

  const [log] = await webhooksRepo.list({ projectId: project.id, invoiceId, limit: 1 });

  return {
    content: [
      {
        type: 'text',
        text: `📡 Вебхук відправлено на ${targetUrl}:\nHTTP Status: ${log?.status_code ?? 'Помилка'}\nЧас: ${log?.duration_ms ?? 0} мс\nТіло відповіді: ${log?.response_body || 'пусто'}`,
      },
    ],
  };
}
