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
import {
  assertProjectAccess,
  listAccessibleProjects,
  ScopeError,
  SCOPE_ERROR_MESSAGE,
} from '@/server/auth/scope';
import { MCP_TOOLS, executeMcpTool } from './tools';
import type { McpScope } from './handlers/projects.handler';

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
  const defaultProjectId = config.defaultProjectId || process.env.PAYMOCK_PROJECT_ID || null;

  // The stdio server is configured with explicit environment variables, so it
  // always resolves to exactly one scope: a single project, or a whole user.
  //
  // A session without a scope sees nothing: the previous code fell back to
  // "list every project in the table" when no user id was configured.
  const scope: McpScope = defaultProjectId
    ? { userId: null, projectId: defaultProjectId }
    : { userId, projectId: null };

  const requireScope = (): void => {
    if (!scope.userId && !scope.projectId) {
      throw new ScopeError('MCP session has no scope: set PAYMOCK_USER_ID or PAYMOCK_PROJECT_ID');
    }
  };

  // 1. LIST RESOURCES
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    requireScope();

    const projects = await listAccessibleProjects(scope, projectsRepo);
    const resources = [
      {
        uri: 'paymock://projects',
        name: 'Список мерчант-проєктів',
        description: 'Доступні проєкти та їхні параметри інтеграції (без секретів)',
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
    requireScope();

    const uri = request.params.uri;

    if (uri === 'paymock://projects') {
      // Only the projects this session may see — and never their tokens.
      const projects = await listAccessibleProjects(scope, projectsRepo);

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              projects.map((project) => ({
                id: project.id,
                name: project.name,
                edrpou: project.edrpou,
                logo_url: project.logo_url,
                default_webhook_url: project.default_webhook_url,
                default_success_url: project.default_success_url,
                default_fail_url: project.default_fail_url,
                created_at: project.created_at,
                updated_at: project.updated_at,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    const statsMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/stats$/);
    const recentInvoicesMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/invoices\/recent$/);

    if (statsMatch || recentInvoicesMatch) {
      const projectId = (statsMatch ?? recentInvoicesMatch)![1];

      try {
        // The same guard the tools use — resources are not a second, weaker
        // door into the data.
        const project = await assertProjectAccess(scope, projectId, projectsRepo);

        const payload = statsMatch
          ? await invoicesRepo.countStats(project.id)
          : await invoicesRepo.list({ projectId: project.id, limit: 10 });

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      } catch (err) {
        if (err instanceof ScopeError) {
          throw new Error(SCOPE_ERROR_MESSAGE);
        }
        throw err;
      }
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
      requireScope();

      return await executeMcpTool({
        toolName: name,
        args,
        scope,
        origin: baseUrl,
        projectsRepo,
        invoicesRepo,
        webhooksRepo,
      });
    } catch (err: any) {
      const message =
        err instanceof ScopeError ? SCOPE_ERROR_MESSAGE : err.message || String(err);

      return {
        isError: true,
        content: [{ type: 'text', text: `Помилка виконання інструменту ${name}: ${message}` }],
      };
    }
  });

  return server;
}
