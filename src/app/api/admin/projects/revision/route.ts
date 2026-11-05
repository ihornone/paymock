import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { guardAdminRead } from '@/server/auth/admin-guard';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(req: NextRequest) {
  const guard = await guardAdminRead(req, 'project.revision');
  if (!guard.ok) return guard.error;

  const { actor } = guard.context;

  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const projectId = req.nextUrl.searchParams.get('projectId');

  const projects = await projectsRepo.listOwned(actor.userId);

  const currentProjectId =
    projectId && projects.some((p) => p.id === projectId)
      ? projectId
      : projects.length > 0
        ? projects[0].id
        : null;

  if (!currentProjectId) {
    return NextResponse.json({ revision: '0', currentProjectId: null }, { headers: NO_STORE });
  }

  const [invoices, webhooks] = await Promise.all([
    invoicesRepo.getRevision(currentProjectId),
    webhooksRepo.getRevision(currentProjectId),
  ]);

  return NextResponse.json(
    {
      revision: `${invoices.count}:${invoices.maxModified}:${webhooks.count}:${webhooks.maxCreated}`,
      currentProjectId,
    },
    { headers: NO_STORE }
  );
}
