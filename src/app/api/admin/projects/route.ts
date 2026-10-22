import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { getRequestUserId } from '@/server/auth/user';
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/server/rate-limit';
import { DASHBOARD_INVOICE_LIMIT, DASHBOARD_WEBHOOK_LIMIT } from '@/shared/utils/pagination';
import { createProjectSchema, updateProjectSchema } from './schema';

const EMPTY_STATS = {
  totalAmount: 0,
  totalCount: 0,
  successCount: 0,
  failureCount: 0,
  createdCount: 0,
};

export async function GET(req: NextRequest) {
  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const userId = await getRequestUserId(req);
  const projectId = req.nextUrl.searchParams.get('projectId');

  // If user is not authenticated, return empty list (never expose other users' projects)
  if (!userId) {
    return NextResponse.json({
      projects: [],
      currentProjectId: null,
      invoices: [],
      webhooks: [],
      stats: EMPTY_STATS,
    });
  }

  const rateLimit = checkRateLimit({
    key: `dashboard:${userId}:${getClientIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.success) {
    return rateLimitResponse(rateLimit, 'Too many dashboard requests. Please try again later.');
  }

  // Strictly list projects belonging to this user
  const projects = await projectsRepo.list(userId);
  const currentProjectId = projectId && projects.some((p) => p.id === projectId)
    ? projectId
    : (projects.length > 0 ? projects[0].id : null);

  if (!currentProjectId) {
    return NextResponse.json({
      projects,
      currentProjectId: null,
      invoices: [],
      webhooks: [],
      stats: EMPTY_STATS,
    });
  }

  // These three queries are independent of each other — they only depend on
  // `currentProjectId`. Awaiting them serially cost 4 sequential round trips;
  // `Promise.all` collapses them into one.
  const [invoices, webhooks, stats] = await Promise.all([
    invoicesRepo.listForDashboard(currentProjectId, DASHBOARD_INVOICE_LIMIT),
    webhooksRepo.listForDashboard(currentProjectId, DASHBOARD_WEBHOOK_LIMIT),
    invoicesRepo.countStats(currentProjectId),
  ]);

  return NextResponse.json(
    {
      projects,
      currentProjectId,
      invoices,
      webhooks,
      stats,
    },
    {
      headers: {
        // Authenticated, per-user payload — must never be cached publicly.
        'Cache-Control': 'private, no-store',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }
  const body = parsed.data;

  const userId = await getRequestUserId(req);
  const projectsRepo = new ProjectsRepository();
  const newProject = await projectsRepo.create({
    name: body.name.trim(),
    userId: userId || null,
    edrpou: body.edrpou?.trim() || '12345678',
  });

  return NextResponse.json({
    ...newProject,
    ok: true,
    project: newProject,
  }, { status: 200 });
}

export async function PATCH(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }
  const body = parsed.data;

  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectsRepo = new ProjectsRepository();
  const updatedProject = await projectsRepo.update(
    body.id,
    {
      name: body.name?.trim(),
      logo_url: body.logo_url,
      default_webhook_url: body.default_webhook_url,
      default_success_url: body.default_success_url,
      default_fail_url: body.default_fail_url,
    },
    userId
  );

  if (!updatedProject) {
    return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json(updatedProject);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectsRepo = new ProjectsRepository();
  const deleted = await projectsRepo.delete(id, userId);

  if (!deleted) {
    return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
