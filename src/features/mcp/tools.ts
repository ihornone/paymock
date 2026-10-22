import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import {
  handleListProjects,
  handleCreateProject,
  handleGetProject,
  handleResetProjectToken,
} from './handlers/projects.handler';
import {
  handleCreateInvoice,
  handleGetInvoice,
  handleListInvoices,
} from './handlers/invoices.handler';
import {
  handleSimulatePayment,
  handleGetWebhookLogs,
  handleRetryWebhook,
} from './handlers/webhooks.handler';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export { MCP_TOOLS } from './schemas';

export interface ExecuteMcpToolOptions {
  toolName: string;
  args: any;
  userId: string;
  origin?: string;
  projectsRepo?: ProjectsRepository;
  invoicesRepo?: InvoicesRepository;
  webhooksRepo?: WebhooksRepository;
}

/**
 * Clean, modular dispatcher for MCP tool executions.
 */
export async function executeMcpTool({
  toolName,
  args = {},
  userId,
  origin = 'http://localhost:8787',
  projectsRepo = new ProjectsRepository(),
  invoicesRepo = new InvoicesRepository(),
  webhooksRepo = new WebhooksRepository(),
}: ExecuteMcpToolOptions): Promise<CallToolResult> {
  const projectCtx = { userId, projectsRepo };
  const invoiceCtx = { userId, origin, projectsRepo, invoicesRepo };
  const webhookCtx = { userId, projectsRepo, invoicesRepo, webhooksRepo };

  switch (toolName) {
    // 1. Projects
    case 'list_projects':
      return handleListProjects(projectCtx);
    case 'create_project':
      return handleCreateProject(args, projectCtx);
    case 'get_project':
      return handleGetProject(args, projectCtx);
    case 'reset_project_token':
      return handleResetProjectToken(args, projectCtx);

    // 2. Invoices
    case 'create_invoice':
      return handleCreateInvoice(args, invoiceCtx);
    case 'get_invoice':
      return handleGetInvoice(args, invoiceCtx);
    case 'list_invoices':
      return handleListInvoices(args, invoiceCtx);

    // 3. Webhooks & Testing
    case 'simulate_payment':
      return handleSimulatePayment(args, webhookCtx);
    case 'get_webhook_logs':
      return handleGetWebhookLogs(args, webhookCtx);
    case 'retry_webhook':
      return handleRetryWebhook(args, webhookCtx);

    default:
      throw new Error(`Невідомий інструмент: ${toolName}`);
  }
}
