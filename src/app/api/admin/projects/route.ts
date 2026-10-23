import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { InvoicesRepository } from '@/server/db/invoices.repository';
import { WebhooksRepository } from '@/server/db/webhooks.repository';
import { guardAdminMutation, guardAdminRead } from '@/server/auth/admin-guard';
import { recordAudit } from '@/server/db/audit.repository';
import { DASHBOARD_INVOICE_LIMIT, DASHBOARD_WEBHOOK_LIMIT } from '@/shared/utils/pagination';
import { createProjectSchema, updateProjectSchema } from './schema';

const EMPTY_STATS = {
  totalAmount: 0,
  totalCount: 0,
  successCount: 0,
  failureCount: 0,
  createdCount: 0,
};

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * The dashboard bootstrap payload.
 *
 * Every method on this route requires a session: an anonymous request is
 * rejected with 401 instead of being treated as "a user without projects".
 * The previous behaviour — 200 with an empty list for GET, no check at all
 * for POST — is what let anonymous requests write rows into the database.
 */
export async function GET(req: NextRequest) {
  const guard = await guardAdminRead(req, 'project.list');
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  const projectsRepo = new ProjectsRepository();
  const invoicesRepo = new InvoicesRepository();
  const webhooksRepo = new WebhooksRepository();

  const projectId = req.nextUrl.searchParams.get('projectId');

  // Strictly the projects of the authenticated account.
  const projects = await projectsRepo.listOwned(actor.userId);

  const currentProjectId =
    projectId && projects.some((p) => p.id === projectId)
      ? projectId
      : projects.length > 0
        ? projects[0].id
        : null;

  if (!currentProjectId) {
    return NextResponse.json(
      {
        projects,
        currentProjectId: null,
        invoices: [],
        webhooks: [],
        stats: EMPTY_STATS,
      },
      { headers: NO_STORE }
    );
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
    { projects, currentProjectId, invoices, webhooks, stats },
    { headers: NO_STORE }
  );
}

/**
 * Creates a project.
 *
 * The owner is taken from the session and from nowhere else; the body is
 * validated against an allow-list (`name`, `edrpou`) and every other field
 * is discarded. The merchant token and the webhook secret are returned
 * exactly once — only their hashes are stored.
 */
export async function POST(req: NextRequest) {
  const guard = await guardAdminMutation(req, {
    action: 'project.create',
    targetType: 'project',
    rateLimitBucket: 'project.create',
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  const parsed = createProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Project name is required' },
      { status: 400, headers: NO_STORE }
    );
  }
  const body = parsed.data;

  const projectsRepo = new ProjectsRepository();
  const created = await projectsRepo.create({
    name: body.name.trim(),
    // The owner comes from the session — never from the request body.
    userId: actor.userId,
    edrpou: body.edrpou?.trim() || '12345678',
  });

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'project.create',
    targetType: 'project',
    targetId: created.project.id,
    ip,
    userAgent,
    result: 'success',
    detail: created.project.name,
  });

  return NextResponse.json(
    {
      ok: true,
      project: created.project,
      // Shown once. Only the SHA-256 hash is stored, so the token cannot be
      // recovered from the API afterwards — a lost token must be rotated.
      token: created.token,
      webhookSecret: created.webhookSecret,
    },
    { status: 201, headers: NO_STORE }
  );
}

/**
 * Updates a project. The ownership check is part of the WHERE clause of the
 * UPDATE, so a foreign project id cannot be modified.
 */
export async function PATCH(req: NextRequest) {
  // The session is checked *before* the body is read: without a session the
  // request is refused with 401 regardless of what it carries.
  const guard = await guardAdminMutation(req, {
    action: 'project.update',
    targetType: 'project',
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  const parsed = updateProjectSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Project id is required' },
      { status: 400, headers: NO_STORE }
    );
  }
  const body = parsed.data;

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
    actor.userId
  );

  if (!updatedProject) {
    await recordAudit({
      actorUserId: actor.userId,
      actorKind: actor.kind,
      action: 'project.update',
      targetType: 'project',
      targetId: body.id,
      ip,
      userAgent,
      result: 'denied',
      detail: 'not owned by the actor',
    });

    // 404, not 403: the existence of a foreign project is not the caller's
    // business.
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404, headers: NO_STORE }
    );
  }

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'project.update',
    targetType: 'project',
    targetId: updatedProject.id,
    ip,
    userAgent,
    result: 'success',
  });

  return NextResponse.json(updatedProject, { headers: NO_STORE });
}

/**
 * Deletes a project. Ownership is checked in the WHERE clause of the DELETE.
 */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'Project id is required' },
      { status: 400, headers: NO_STORE }
    );
  }

  const guard = await guardAdminMutation(req, {
    action: 'project.delete',
    targetType: 'project',
    targetId: id,
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  const projectsRepo = new ProjectsRepository();
  const deleted = await projectsRepo.delete(id, actor.userId);

  if (!deleted) {
    await recordAudit({
      actorUserId: actor.userId,
      actorKind: actor.kind,
      action: 'project.delete',
      targetType: 'project',
      targetId: id,
      ip,
      userAgent,
      result: 'denied',
      detail: 'not owned by the actor',
    });

    return NextResponse.json({ error: 'Project not found' }, { status: 404, headers: NO_STORE });
  }

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'project.delete',
    targetType: 'project',
    targetId: id,
    ip,
    userAgent,
    result: 'success',
  });

  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
