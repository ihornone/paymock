import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/server/db/projects.repository';
import { getRequestUserId } from '@/server/auth/user';
import { invalidateTokenCache } from '@/server/auth/token-cache';

export async function POST(req: NextRequest) {
  let body: { projectId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const userId = await getRequestUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectsRepo = new ProjectsRepository();

  // Read the current token first: the cache must drop the *old* token, and
  // `resetToken` only returns the new one.
  const existingProject = await projectsRepo.findById(body.projectId, userId);
  if (!existingProject) {
    return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
  }

  const updatedProject = await projectsRepo.resetToken(body.projectId, userId);

  if (!updatedProject) {
    return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
  }

  // The rotated-away token must not stay valid in the in-isolate token cache.
  invalidateTokenCache(existingProject.token);

  return NextResponse.json({
    success: true,
    project: updatedProject,
  });
}
