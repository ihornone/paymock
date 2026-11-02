import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { guardAdminRead } from '@/server/auth/admin-guard';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * The dashboard's change probe.
 *
 * The dashboard polls this instead of the full bootstrap payload: a payment
 * that happens in the checkout tab (or through the MCP / API surface) has to
 * appear in an open dashboard without a manual reload, but re-running the
 * four queries of `GET /api/admin/projects` every few seconds would spend the
 * account's database quota on responses that are identical anyway.
 *
 * The response is a single opaque revision string built from cheap aggregates
 * (row counts plus the newest `modified_date` / `created_at`) of the selected
 * project. The client refetches the dashboard only when the string changes.
 *
 * The project resolution mirrors the bootstrap route exactly: a `projectId`
 * parameter is honoured only when the project is owned by the session, and
 * the fallback is the first owned project.
 */
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
