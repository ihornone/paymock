import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { getRequestUserId } from '@/lib/auth-user';
import { MCP_TOOLS, executeMcpTool } from '@/src/mcp/tools';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { Project } from '@/src/types/models';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Token, x-token, mcp-protocol-version, mcp-method, baggage, sentry-trace',
};

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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const token = extractToken(req);

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

  const projectsRepo = new ProjectsRepository();
  let defaultProject: Project | null = null;

  if (rawToken) {
    if (rawToken.startsWith('pmk_usr_')) {
      userId = rawToken.replace('pmk_usr_', '').trim();
    } else if (rawToken.startsWith('user_')) {
      userId = rawToken.trim();
    } else {
      const foundProject = await projectsRepo.findByToken(rawToken);
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

  const origin = req.nextUrl.origin;
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

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

  // 4. TOOLS/LIST
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
        userId: userId || defaultProject?.user_id || 'anonymous',
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
      const projects = await projectsRepo.list(userId);
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(projects, null, 2),
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
      const project = await projectsRepo.findById(pId, userId);
      if (!project) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: `Resource not found or unauthorized: ${uri}` },
          },
          { headers: corsHeaders }
        );
      }
      const stats = await invoicesRepo.countStats(pId);
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
      const project = await projectsRepo.findById(pId, userId);
      if (!project) {
        return NextResponse.json(
          {
            jsonrpc: '2.0',
            id,
            error: { code: -32002, message: `Resource not found or unauthorized: ${uri}` },
          },
          { headers: corsHeaders }
        );
      }
      const invoices = await invoicesRepo.list({ projectId: pId, limit: 10 });
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
