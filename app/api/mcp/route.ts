import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { getRequestUserId } from '@/lib/auth-user';
import { MCP_TOOLS, executeMcpTool } from '@/src/mcp/tools';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import type { Project } from '@/src/types/models';

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

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const token = extractToken(req);

  return NextResponse.json({
    name: 'paymock-mcp-server',
    version: '1.1.0',
    protocolVersion: '2024-11-05',
    status: 'active',
    mode: 'global-account-scoped',
    endpoint: `${origin}/api/mcp`,
    authenticated: !!token,
    capabilities: {
      tools: MCP_TOOLS.map((t) => t.name),
    },
    clientConfigExample: {
      url: `${origin}/api/mcp`,
      headers: {
        'X-Token': token || 'pmk_live_токен_будь_якого_проєкту_або_акаунта',
      },
    },
  });
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
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      { status: 400 }
    );
  }

  const { id, method, params } = body;

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
          'Retry-After': String(Math.max(1, rateLimit.reset - Math.ceil(Date.now() / 1000))),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.reset),
        },
      }
    );
  }

  const origin = req.nextUrl.origin;
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  // 1. INITIALIZE
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: 'paymock-mcp-server',
          version: '1.1.0',
        },
      },
    });
  }

  // 2. TOOLS/LIST
  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    });
  }

  // 3. TOOLS/CALL
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

      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (err: any) {
      return NextResponse.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: err.message || String(err),
        },
      });
    }
  }

  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32601, message: `Method not found: ${method}` }, id },
    { status: 404 }
  );
}
