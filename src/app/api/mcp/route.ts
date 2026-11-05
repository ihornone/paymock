import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { authenticateRequest } from '@/server/auth/session';
import { findProjectByToken } from '@/server/auth/token-cache';
import {
  isPersonalAccessToken,
  verifyPersonalAccessToken,
} from '@/server/auth/personal-access-token';
import {
  assertProjectAccess,
  listAccessibleProjects,
  ScopeError,
  SCOPE_ERROR_MESSAGE,
  type ProjectScope,
} from '@/server/auth/scope';
import { recordAudit } from '@/server/db/audit.repository';
import { MCP_TOOLS, executeMcpTool } from '@/features/mcp/tools';
import type { McpScope } from '@/features/mcp/handlers/projects.handler';
import { checkRateLimit, getClientIp } from '@/server/rate-limit';
import { logger } from '@/shared/logger';

const MCP_ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const MCP_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Token',
  'x-token',
  'mcp-protocol-version',
  'mcp-method',
  'mcp-session-id',
  'baggage',
  'sentry-trace',
].join(', ');

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

function buildCorsHeaders(req: NextRequest): Record<string, string> {
  const requestOrigin = req.headers.get('origin');

  let allowedOrigin = '*';
  if (MCP_ALLOWED_ORIGINS.length > 0) {
    allowedOrigin =
      requestOrigin && MCP_ALLOWED_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : MCP_ALLOWED_ORIGINS[0];
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': MCP_ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function extractToken(req: NextRequest): string | null {
  const xToken = req.headers.get('x-token') || req.headers.get('X-Token');
  if (xToken && xToken.trim()) return xToken.trim();

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }

  return null;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(req),
  });
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const token = extractToken(req);
  const corsHeaders = buildCorsHeaders(req);

  if (!token) {
    await recordAudit({
      actorUserId: null,
      actorKind: 'anonymous',
      action: 'mcp.manifest',
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
      result: 'denied',
      detail: 'no credential',
    });

    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { ...corsHeaders, ...NO_STORE } }
    );
  }

  return NextResponse.json(
    {
      name: 'paymock-mcp-server',
      version: '1.1.0',
      protocolVersion: '2024-11-05',
      status: 'active',
      mode: 'global-account-scoped',
      endpoint: `${origin}/api/mcp`,
      authenticated: true,
      capabilities: {
        tools: MCP_TOOLS.map((t) => t.name),
        resources: ['paymock://projects'],
      },
      clientConfigExample: {
        url: `${origin}/api/mcp`,
        headers: {
          'X-Token': '<your project or account token>',
        },
      },
    },
    { headers: { ...corsHeaders, ...NO_STORE } }
  );
}

export async function POST(req: NextRequest) {
  const rawToken = extractToken(req);
  const corsHeaders = buildCorsHeaders(req);
  const clientIp = getClientIp(req);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      { status: 400, headers: corsHeaders }
    );
  }

  const method = body?.method || req.headers.get('mcp-method');
  const id = body?.id;
  const params = body?.params;

  const rateLimitKey = `mcp:${rawToken || clientIp}`;
  const rateLimit = checkRateLimit({
    key: rateLimitKey,
    limit: 120,
    windowMs: 60_000,
  });

  if (!rateLimit.success) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Rate limit exceeded: too many MCP requests. Please try again later.',
        },
        id: id ?? null,
      },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          ...NO_STORE,
          'Retry-After': String(Math.max(1, rateLimit.reset - Math.ceil(Date.now() / 1000))),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  if (
    method === 'notifications/initialized' ||
    (typeof method === 'string' && method.startsWith('notifications/')) ||
    id === undefined
  ) {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (method === 'ping') {
    return NextResponse.json(
      { jsonrpc: '2.0', id, result: {} },
      { headers: corsHeaders }
    );
  }

  if (method === 'server/discover') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          supportedVersions: ['2024-11-05'],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'paymock-mcp-server', version: '1.1.0' },
          instructions:
            'Paymock Acquiring Mock Platform MCP server. Manage merchant projects, test invoices, and inspect webhooks.',
        },
      },
      { headers: corsHeaders }
    );
  }

  if (method === 'initialize') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'paymock-mcp-server', version: '1.1.0' },
          instructions:
            'Paymock Acquiring Mock Platform MCP server. Manage merchant projects, test invoices, and inspect webhooks.',
        },
      },
      { headers: corsHeaders }
    );
  }

  const origin = req.nextUrl.origin;
  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  let scope: McpScope = { userId: null, projectId: null };

  if (rawToken) {
    if (isPersonalAccessToken(rawToken)) {
      scope.userId = await verifyPersonalAccessToken(rawToken);
    } else {
      const foundProject = await findProjectByToken(rawToken, projectsRepo);
      if (foundProject) {
        scope.projectId = foundProject.id;
      }
    }
  }

  if (!scope.userId && !scope.projectId) {
    const actor = await authenticateRequest(req);
    if (actor) {
      scope.userId = actor.userId;
    }
  }

  if (!scope.userId && !scope.projectId) {
    await recordAudit({
      actorUserId: null,
      actorKind: 'anonymous',
      action: `mcp.${method}`,
      ip: clientIp,
      userAgent: req.headers.get('user-agent'),
      result: 'denied',
      detail: 'no valid scope',
    });

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Не знайдено авторизаційних даних. Передайте валідний X-Token вашого проєкту або токен користувача в заголовках запиту.',
        },
        id: null,
      },
      { status: 401, headers: { ...corsHeaders, ...NO_STORE } }
    );
  }

  if (method === 'tools/list') {
    return NextResponse.json(
      { jsonrpc: '2.0', id, result: { tools: MCP_TOOLS } },
      { headers: corsHeaders }
    );
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    const MUTATING_TOOLS = new Set([
      'create_project',
      'create_invoice',
      'simulate_payment',
      'reset_project_token',
      'retry_webhook',
    ]);

    if (MUTATING_TOOLS.has(toolName)) {
      const mutationLimit = checkRateLimit({
        key: `mcp:mutation:${scope.projectId || scope.userId || clientIp}`,
        limit: 30,
        windowMs: 60_000,
      });

      if (!mutationLimit.success) {
        await recordAudit({
          actorUserId: scope.userId,
          actorKind: scope.userId ? 'authenticated' : 'project_token',
          action: `mcp.tool.${toolName}`,
          ip: clientIp,
          userAgent: req.headers.get('user-agent'),
          result: 'denied',
          detail: 'rate limit exceeded',
        });

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Rate limit exceeded: too many mutations.' },
            id: id ?? null,
          },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              ...NO_STORE,
              'Retry-After': String(
                Math.max(1, mutationLimit.reset - Math.ceil(Date.now() / 1000))
              ),
            },
          }
        );
      }
    }

    try {
      const result = await executeMcpTool({
        toolName,
        args,
        scope,
        origin,
        projectsRepo,
        invoicesRepo,
        webhooksRepo,
      });

      await recordAudit({
        actorUserId: scope.userId,
        actorKind: scope.userId ? 'authenticated' : 'project_token',
        action: `mcp.tool.${toolName}`,
        targetType: 'mcp_tool',
        ip: clientIp,
        userAgent: req.headers.get('user-agent'),
        result: 'success',
      });

      return NextResponse.json(
        { jsonrpc: '2.0', id, result },
        { headers: { ...corsHeaders, ...NO_STORE } }
      );
    } catch (err: any) {
      const isScopeError = err instanceof ScopeError;

      await recordAudit({
        actorUserId: scope.userId,
        actorKind: scope.userId ? 'authenticated' : 'project_token',
        action: `mcp.tool.${toolName}`,
        targetType: 'mcp_tool',
        ip: clientIp,
        userAgent: req.headers.get('user-agent'),
        result: isScopeError ? 'denied' : 'error',
        detail: isScopeError ? 'scope violation' : undefined,
      });

      logger.warn({
        event: 'mcp_tool_failed',
        tool: toolName,
        scopeError: isScopeError,
      });

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: isScopeError ? -32002 : -32603,
            message: isScopeError ? SCOPE_ERROR_MESSAGE : err.message || String(err),
          },
        },
        { headers: corsHeaders }
      );
    }
  }

  if (method === 'resources/list') {
    const ownedProjects = await listAccessibleProjects(scope, projectsRepo);
    const resources = [
      {
        uri: 'paymock://projects',
        name: 'Список мерчант-проєктів',
        description: 'Доступні проєкти та їхні параметри інтеграції (без секретів)',
        mimeType: 'application/json',
      },
    ];

    for (const project of ownedProjects) {
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

    return NextResponse.json(
      { jsonrpc: '2.0', id, result: { resources } },
      { headers: { ...corsHeaders, ...NO_STORE } }
    );
  }

  if (method === 'resources/read') {
    const uri = params?.uri;
    if (!uri || typeof uri !== 'string') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params: uri is required' },
        },
        { headers: corsHeaders }
      );
    }

    const fail = async (detail: string) => {
      await recordAudit({
        actorUserId: scope.userId,
        actorKind: scope.userId ? 'authenticated' : 'project_token',
        action: 'mcp.resource.read',
        targetType: 'mcp_resource',
        ip: clientIp,
        userAgent: req.headers.get('user-agent'),
        result: 'denied',
        detail,
      });

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: { code: -32002, message: SCOPE_ERROR_MESSAGE },
        },
        { headers: { ...corsHeaders, ...NO_STORE } }
      );
    };

    if (uri === 'paymock://projects') {
      const ownedProjects = await listAccessibleProjects(scope, projectsRepo);

      await recordAudit({
        actorUserId: scope.userId,
        actorKind: scope.userId ? 'authenticated' : 'project_token',
        action: 'mcp.resource.read',
        targetType: 'mcp_resource',
        targetId: 'paymock://projects',
        ip: clientIp,
        userAgent: req.headers.get('user-agent'),
        result: 'success',
      });

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(
                  ownedProjects.map((project) => ({
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
          },
        },
        { headers: { ...corsHeaders, ...NO_STORE } }
      );
    }

    const statsMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/stats$/);
    const recentInvoicesMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/invoices\/recent$/);

    if (statsMatch || recentInvoicesMatch) {
      const projectId = (statsMatch ?? recentInvoicesMatch)![1];

      try {
        const project = await assertProjectAccess(scope, projectId, projectsRepo);

        const payload = statsMatch
          ? await invoicesRepo.countStats(project.id)
          : await invoicesRepo.list({ projectId: project.id, limit: 10 });

        await recordAudit({
          actorUserId: scope.userId,
          actorKind: scope.userId ? 'authenticated' : 'project_token',
          action: 'mcp.resource.read',
          targetType: 'mcp_resource',
          targetId: uri,
          ip: clientIp,
          userAgent: req.headers.get('user-agent'),
          result: 'success',
        });

        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(payload, null, 2),
                },
              ],
            },
          },
          { headers: { ...corsHeaders, ...NO_STORE } }
        );
      } catch (err) {
        if (err instanceof ScopeError) {
          return fail('scope violation');
        }
        throw err;
      }
    }

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: 'Resource not found' },
      },
      { headers: corsHeaders }
    );
  }

  if (method === 'prompts/list') {
    return NextResponse.json(
      { jsonrpc: '2.0', id, result: { prompts: [] } },
      { headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${method}` }, id: id ?? null },
    { status: 200, headers: corsHeaders }
  );
}
