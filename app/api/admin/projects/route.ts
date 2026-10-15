import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import { InvoicesRepository } from '@/lib/db/invoices.repository';
import { WebhooksRepository } from '@/lib/db/webhooks.repository';
import { getRequestUserId } from '@/lib/auth-user';

export async function GET(req: NextRequest) {
  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const userId = getRequestUserId(req);
  const projectId = req.nextUrl.searchParams.get('projectId');

  // If user is not authenticated, return empty list (never expose other users' projects)
  if (!userId) {
    return NextResponse.json({
      projects: [],
      currentProjectId: null,
      invoices: [],
      webhooks: [],
      stats: { totalAmount: 0, totalCount: 0, successCount: 0, failureCount: 0, createdCount: 0 },
    });
  }

  // Strictly list projects belonging to this user
  const projects = await projectsRepo.list(userId);
  const currentProjectId = projectId && projects.some((p) => p.id === projectId)
    ? projectId
    : (projects.length > 0 ? projects[0].id : null);

  const invoices = currentProjectId ? await invoicesRepo.list({ projectId: currentProjectId, limit: 50 }) : [];
  const webhooks = currentProjectId ? await webhooksRepo.list({ projectId: currentProjectId, limit: 20 }) : [];
  const stats = currentProjectId ? await invoicesRepo.countStats(currentProjectId) : { totalAmount: 0, totalCount: 0, successCount: 0, failureCount: 0, createdCount: 0 };

  return NextResponse.json({
    projects,
    currentProjectId,
    invoices,
    webhooks,
    stats,
  });
}

export async function POST(req: NextRequest) {
  let body: { name: string; edrpou?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
  }

  const userId = getRequestUserId(req);
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
  let body: {
    id: string;
    name?: string;
    logo_url?: string | null;
    default_webhook_url?: string | null;
    default_success_url?: string | null;
    default_fail_url?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Project id is required' }, { status: 400 });
  }

  const userId = getRequestUserId(req);
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

  const userId = getRequestUserId(req);
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
