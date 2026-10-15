import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { generateInvoiceId } from '@/src/shared/utils/id';
import { isSafeWebhookUrl } from '@/lib/webhook';
import { resolveTargetProject } from './projects.handler';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface InvoicesHandlerContext {
  userId: string;
  origin: string;
  projectsRepo: ProjectsRepository;
  invoicesRepo: InvoicesRepository;
}

export async function handleCreateInvoice(
  args: any,
  { userId, origin, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const { projectId, amount, ccy = 980, destination, comment, webHookUrl, redirectUrl } = args || {};
  if (!amount || !destination) {
    throw new Error('Поля amount та destination є обов\'язковими.');
  }

  if (webHookUrl && !isSafeWebhookUrl(webHookUrl)) {
    throw new Error('Небезпечний або невалідний webHookUrl (блокування SSRF).');
  }

  const project = await resolveTargetProject(projectId, userId, projectsRepo);

  const invId = generateInvoiceId();
  const pageUrl = `${origin}/pay/${invId}`;
  const appUrl = `paymock://pay?invoiceId=${invId}`;

  const created = await invoicesRepo.create({
    id: invId,
    projectId: project.id,
    amount: Number(amount),
    ccy: Number(ccy),
    paymentType: 'debit',
    destination,
    comment,
    webhookUrl: webHookUrl || project.default_webhook_url || undefined,
    redirectUrl: redirectUrl || project.default_success_url || undefined,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            invoiceId: created.id,
            status: created.status,
            amount: created.amount,
            ccy: created.ccy,
            destination: created.destination,
            pageUrl,
            appUrl,
            projectId: project.id,
            projectName: project.name,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetInvoice(
  args: any,
  { userId, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const invId = args?.invoiceId;
  if (!invId) throw new Error('Потрібно вказати invoiceId.');

  const invoice = await invoicesRepo.findById(invId);
  if (!invoice) {
    throw new Error(`Рахунок ${invId} не знайдено.`);
  }

  // Verify user owns this invoice's project
  const project = await projectsRepo.findById(invoice.project_id, userId);
  if (!project) {
    throw new Error(`Рахунок ${invId} належить проєкту іншого користувача.`);
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(invoice, null, 2) }],
  };
}

export async function handleListInvoices(
  args: any,
  { userId, origin, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const { projectId, status, limit = 20 } = args || {};

  let targetProjectId = projectId;
  if (!targetProjectId) {
    const project = await resolveTargetProject(undefined, userId, projectsRepo);
    targetProjectId = project.id;
  } else {
    await resolveTargetProject(targetProjectId, userId, projectsRepo);
  }

  const invoices = await invoicesRepo.list({
    projectId: targetProjectId,
    status: status && status !== 'all' ? status : undefined,
    limit: Number(limit),
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          invoices.map((i) => ({
            id: i.id,
            status: i.status,
            amount: i.amount,
            ccy: i.ccy,
            destination: i.destination,
            created_date: i.created_date,
            payUrl: `${origin}/pay/${i.id}`,
          })),
          null,
          2
        ),
      },
    ],
  };
}
