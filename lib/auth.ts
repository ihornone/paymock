import { NextRequest, NextResponse } from 'next/server';
import { ProjectsRepository } from '@/lib/db/projects.repository';
import type { Project } from '@/src/types/models';

export async function validateMerchantToken(req: NextRequest): Promise<{ project: Project } | NextResponse> {
  const token = req.headers.get('X-Token');

  if (!token) {
    return NextResponse.json(
      {
        errCode: 'FORBIDDEN',
        errText: 'invalid or missing X-Token',
      },
      { status: 403 }
    );
  }

  const projectsRepo = new ProjectsRepository();
  const project = await projectsRepo.findByToken(token);

  if (!project) {
    return NextResponse.json(
      {
        errCode: 'FORBIDDEN',
        errText: 'invalid or missing X-Token',
      },
      { status: 403 }
    );
  }

  return { project };
}
