import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { generateInvoiceId } from '@/shared/utils/id';
import { isSafeWebhookUrl } from '@/server/webhook';
import { resolveTargetProject, type McpScope } from './projects.handler';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface InvoicesHandlerContext {
  scope: McpScope;
  origin: string;
  projectsRepo: ProjectsRepository;
  invoicesRepo: InvoicesRepository;
}

export async function handleCreateInvoice(
  args: any,
  { scope, origin, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const { projectId, amount, ccy = 980, destination, comment, webHookUrl, redirectUrl } = args || {};
  if (!amount || !destination) {
    throw new Error('Поля amount та destination є обов\'язковими.');
  }

  if (webHookUrl && !isSafeWebhookUrl(webHookUrl)) {
    throw new Error('Небезпечний або невалідний webHookUrl (блокування SSRF).');
  }

  const project = await resolveTargetProject(projectId, scope, projectsRepo);

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
  { scope, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const invId = args?.invoiceId;
  if (!invId) throw new Error('Потрібно вказати invoiceId.');

  const invoice = await invoicesRepo.findById(invId);
  if (!invoice) {
    throw new Error(`Рахунок ${invId} не знайдено.`);
  }

  // Verify the session is allowed to touch this invoice's project
  await resolveTargetProject(invoice.project_id, scope, projectsRepo);

  return {
    content: [{ type: 'text', text: JSON.stringify(invoice, null, 2) }],
  };
}

export async function handleListInvoices(
  args: any,
  { scope, origin, projectsRepo, invoicesRepo }: InvoicesHandlerContext
): Promise<CallToolResult> {
  const { projectId, status, limit = 20 } = args || {};

  // `resolveTargetProject` doubles as the ownership check: it throws when the
  // session is not allowed to touch the requested project.
  const targetProject = await resolveTargetProject(projectId, scope, projectsRepo);

  const invoices = await invoicesRepo.list({
    projectId: targetProject.id,
    status: status && status !== 'all' ? status : undefined,
    limit,
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
