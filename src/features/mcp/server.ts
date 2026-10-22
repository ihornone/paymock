import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { MCP_TOOLS, executeMcpTool } from './tools';

export interface McpServerConfig {
  baseUrl?: string;
  userId?: string | null;
  defaultProjectId?: string | null;
}

export function createPaymockMcpServer(config: McpServerConfig = {}) {
  const server = new Server(
    {
      name: 'paymock-mcp-server',
      version: '1.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const baseUrl = config.baseUrl || process.env.PAYMOCK_URL || 'http://localhost:8787';
  const userId = config.userId || process.env.PAYMOCK_USER_ID || null;

  // 1. LIST RESOURCES
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const projects = await projectsRepo.list(userId);
    const resources = [
      {
        uri: 'paymock://projects',
        name: 'Список мерчант-проєктів',
        description: 'Усі доступні проєкти та їхні параметри інтеграції (X-Token, URLs)',
        mimeType: 'application/json',
      },
    ];

    for (const project of projects) {
      resources.push({
        uri: `paymock://projects/${project.id}/stats`,
        name: `Статистика проєкту ${project.name}`,
        description: `Поточні фінансові показники та лічильники статусів для ${project.name}`,
        mimeType: 'application/json',
      });
      resources.push({
        uri: `paymock://projects/${project.id}/invoices/recent`,
        name: `Останні рахунки проєкту ${project.name}`,
        description: `Останні 10 згенерованих рахунків для ${project.name}`,
        mimeType: 'application/json',
      });
    }

    return { resources };
  });

  // 2. READ RESOURCE
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (uri === 'paymock://projects') {
      const projects = await projectsRepo.list(userId);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects, null, 2),
          },
        ],
      };
    }

    const statsMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/stats$/);
    if (statsMatch) {
      const pId = statsMatch[1];
      const stats = await invoicesRepo.countStats(pId);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    }

    const recentInvoicesMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/invoices\/recent$/);
    if (recentInvoicesMatch) {
      const pId = recentInvoicesMatch[1];
      const invoices = await invoicesRepo.list({ projectId: pId, limit: 10 });
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(invoices, null, 2),
          },
        ],
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });

  // 3. LIST TOOLS
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOLS,
    };
  });

  // 4. CALL TOOL
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      return await executeMcpTool({
        toolName: name,
        args,
        userId: userId || 'anonymous',
        origin: baseUrl,
        projectsRepo,
        invoicesRepo,
        webhooksRepo,
      });
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Помилка виконання інструменту ${name}: ${err.message || String(err)}` }],
      };
    }
  });

  return server;
}
