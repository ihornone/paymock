import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { guardAdminMutation } from '@/server/auth/admin-guard';
import { recordAudit } from '@/server/db/audit.repository';
import { invalidateTokenCacheForProject } from '@/server/auth/token-cache';
import { logger } from '@/shared/logger';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/**
 * Rotates the merchant token of a project.
 *
 * The old token stops working immediately — only the hash of the new one is
 * stored. The new token is returned exactly once.
 */
export async function POST(req: NextRequest) {
  // The session is checked before the body is read: without a session the
  // request is refused with 401 regardless of what it carries.
  const guard = await guardAdminMutation(req, {
    action: 'project.token.rotate',
    targetType: 'project',
    rateLimitBucket: 'project.token.rotate',
    limit: 10,
  });
  if (!guard.ok) return guard.error;

  const { actor, ip, userAgent } = guard.context;

  let body: { projectId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  if (!body.projectId) {
    return NextResponse.json(
      { error: 'Missing projectId' },
      { status: 400, headers: NO_STORE }
    );
  }

  const projectsRepo = new ProjectsRepository();

  // Ownership is part of the WHERE clause of the UPDATE.
  const rotated = await projectsRepo.resetToken(body.projectId, actor.userId);

  if (!rotated) {
    await recordAudit({
      actorUserId: actor.userId,
      actorKind: actor.kind,
      action: 'project.token.rotate',
      targetType: 'project',
      targetId: body.projectId,
      ip,
      userAgent,
      result: 'denied',
      detail: 'not owned by the actor',
    });

    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404, headers: NO_STORE }
    );
  }

  // The rotated-away token must not stay valid in the in-isolate cache.
  invalidateTokenCacheForProject(rotated.project.id);

  await recordAudit({
    actorUserId: actor.userId,
    actorKind: actor.kind,
    action: 'project.token.rotate',
    targetType: 'project',
    targetId: rotated.project.id,
    ip,
    userAgent,
    result: 'success',
  });

  logger.info({
    event: 'project_token_rotated',
    projectId: rotated.project.id,
    actorUserId: actor.userId,
  });

  return NextResponse.json(
    {
      success: true,
      project: rotated.project,
      // Shown once — only its hash is stored.
      token: rotated.token,
    },
    { headers: NO_STORE }
  );
}
