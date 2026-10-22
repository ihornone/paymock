import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { getRequestUserId } from '@/server/auth/user';
import { findProjectByToken } from '@/server/auth/token-cache';
import { MCP_TOOLS, executeMcpTool } from '@/features/mcp/tools';
import { checkRateLimit, getClientIp } from '@/server/rate-limit';
import type { Project } from '@/shared/types/models';

/**
 * CORS policy for the MCP endpoint.
 *
 * MCP clients are native/desktop processes, not browsers, and they authenticate
 * with an `X-Token` header — never with cookies. CORS is therefore a browser
 * access-control mechanism here, not an authentication control, and `*` is safe.
 *
 * When `MCP_ALLOWED_ORIGINS` is set the policy switches to an explicit
 * allow-list, which is the recommended configuration for browser-hosted clients.
 */
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

  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken && queryToken.trim()) return queryToken.trim();

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

  return NextResponse.json(
    {
      name: 'paymock-mcp-server',
      version: '1.1.0',
      protocolVersion: '2024-11-05',
      status: 'active',
      mode: 'global-account-scoped',
      endpoint: `${origin}/api/mcp`,
      authenticated: !!token,
      capabilities: {
        tools: MCP_TOOLS.map((t) => t.name),
        resources: ['paymock://projects'],
      },
      clientConfigExample: {
        url: `${origin}/api/mcp`,
        headers: {
          'X-Token': token || 'pmk_live_токен_будь_якого_проєкту_або_акаунта',
        },
      },
    },
    { headers: corsHeaders }
  );
}

export async function POST(req: NextRequest) {
  const rawToken = extractToken(req);
  let userId = getRequestUserId(req);
  const corsHeaders = buildCorsHeaders(req);

  const projectsRepo = new ProjectsRepository();
  let defaultProject: Project | null = null;

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

  const clientIp = getClientIp(req);
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
          'Retry-After': String(Math.max(1, rateLimit.reset - Math.ceil(Date.now() / 1000))),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  // 0. NOTIFICATIONS (Per JSON-RPC 2.0 & MCP, notifications have no id or start with notifications/)
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

  // 1. PING
  if (method === 'ping') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {},
      },
      { headers: corsHeaders }
    );
  }

  // 2. SERVER DISCOVER (Modern MCP protocol probe)
  if (method === 'server/discover') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          supportedVersions: ['2024-11-05'],
          capabilities: { tools: {}, resources: {} },
          serverInfo: {
            name: 'paymock-mcp-server',
            version: '1.1.0',
          },
          instructions:
            'Paymock Acquiring Mock Platform MCP server. Manage merchant projects, test invoices, and inspect webhooks.',
        },
      },
      { headers: corsHeaders }
    );
  }

  // 3. INITIALIZE
  if (method === 'initialize') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          serverInfo: {
            name: 'paymock-mcp-server',
            version: '1.1.0',
          },
          instructions:
            'Paymock Acquiring Mock Platform MCP server. Manage merchant projects, test invoices, and inspect webhooks.',
        },
      },
      { headers: corsHeaders }
    );
  }

  const origin = req.nextUrl.origin;
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  // 4. TOOLS/LIST
  //
  // From here on the request touches account data, so the token must be
  // resolved. The protocol methods above (`server/discover`, `initialize`,
  // `notifications/*`, `ping`) never reach this point and therefore never
  // cost a database query — a full MCP handshake is now 0 queries.
  if (rawToken) {
    if (rawToken.startsWith('pmk_usr_')) {
      userId = rawToken.replace('pmk_usr_', '').trim();
    } else if (rawToken.startsWith('user_')) {
      userId = rawToken.trim();
    } else {
      const foundProject = await findProjectByToken(rawToken, projectsRepo);
      if (foundProject) {
        defaultProject = foundProject;
        if (!userId && foundProject.user_id) {
          userId = foundProject.user_id;
        }
      }
    }
  }

  // If no user context and no project found from token, return 401
  if (!userId && !defaultProject) {
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
      { status: 401, headers: corsHeaders }
    );
  }

  // The owning user id used for every tenant-scoped query. A project token
  // carries its own `user_id`, so it can be resolved from either source.
  const effectiveUserId = userId || defaultProject?.user_id || '';

  if (method === 'tools/list') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS,
        },
      },
      { headers: corsHeaders }
    );
  }

  // 5. TOOLS/CALL
  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      const result = await executeMcpTool({
        toolName,
        args,
        userId: effectiveUserId || 'anonymous',
        origin,
        projectsRepo,
        invoicesRepo,
        webhooksRepo,
      });

      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result,
        },
        { headers: corsHeaders }
      );
    } catch (err: any) {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: err.message || String(err),
          },
        },
        { headers: corsHeaders }
      );
    }
  }

  // 6. RESOURCES/LIST
  if (method === 'resources/list') {
    const ownedProjects = await projectsRepo.list(effectiveUserId);
    const resources = [
      {
        uri: 'paymock://projects',
        name: 'Список мерчант-проєктів',
        description: 'Усі доступні проєкти та їхні параметри інтеграції (X-Token, URLs)',
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
      {
        jsonrpc: '2.0',
        id,
        result: { resources },
      },
      { headers: corsHeaders }
    );
  }

  // 7. RESOURCES/READ
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

    if (uri === 'paymock://projects') {
      const ownedProjects = await projectsRepo.list(effectiveUserId);
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(ownedProjects, null, 2),
              },
            ],
          },
        },
        { headers: corsHeaders }
      );
    }

    const statsMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/stats$/);
    if (statsMatch) {
      const pId = statsMatch[1];
      // Ownership is enforced inside the JOIN — one query, no separate check.
      const stats = await invoicesRepo.countStatsForUser(pId, effectiveUserId);
      if (!stats) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: `Resource not found or unauthorized: ${uri}` },
          },
          { headers: corsHeaders }
        );
      }
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(stats, null, 2),
              },
            ],
          },
        },
        { headers: corsHeaders }
      );
    }

    const recentInvoicesMatch = uri.match(/^paymock:\/\/projects\/([^/]+)\/invoices\/recent$/);
    if (recentInvoicesMatch) {
      const pId = recentInvoicesMatch[1];
      // Ownership is enforced inside the JOIN — one query, no separate check.
      const invoices = await invoicesRepo.listRecentForUser(pId, effectiveUserId, 10);
      if (!invoices) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: `Resource not found or unauthorized: ${uri}` },
          },
          { headers: corsHeaders }
        );
      }
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(invoices, null, 2),
              },
            ],
          },
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        error: { code: -32002, message: `Resource not found: ${uri}` },
      },
      { headers: corsHeaders }
    );
  }

  // 8. PROMPTS/LIST
  if (method === 'prompts/list') {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [],
        },
      },
      { headers: corsHeaders }
    );
  }

  // 9. UNKNOWN METHOD
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: { code: -32601, message: `Method not found: ${method}` },
      id: id ?? null,
    },
    { status: 200, headers: corsHeaders }
  );
}
