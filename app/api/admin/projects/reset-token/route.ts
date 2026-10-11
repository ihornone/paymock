import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';

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

  const projectsRepo = new ProjectsRepository();
  const updatedProject = await projectsRepo.resetToken(body.projectId);

  if (!updatedProject) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    project: updatedProject,
  });
}
