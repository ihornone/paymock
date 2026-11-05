import { ProjectsRepository } from '@/server/db/projects.repository';
import type { Project } from '@/shared/types/models';

export interface ProjectScope {
  userId: string | null;
  projectId: string | null;
}

export const SCOPE_ERROR_MESSAGE = 'Resource not found or unauthorized';

export class ScopeError extends Error {
  readonly status: number;

  constructor(message: string = SCOPE_ERROR_MESSAGE, status: number = 403) {
    super(message);
    this.name = 'ScopeError';
    this.status = status;
  }
}

export async function assertProjectAccess(
  scope: ProjectScope,
  projectId?: string | null,
  projectsRepo: ProjectsRepository = new ProjectsRepository()
): Promise<Project> {
  if (scope.projectId) {
    if (projectId && projectId !== scope.projectId) {
      throw new ScopeError();
    }
    const project = await projectsRepo.findById(scope.projectId);
    if (!project) throw new ScopeError();
    return project;
  }

  if (!scope.userId) {
    throw new ScopeError();
  }

  const project = projectId
    ? await projectsRepo.findById(projectId, scope.userId)
    : await projectsRepo.findFirstByUser(scope.userId);

  if (!project) throw new ScopeError();
  return project;
}

export async function listAccessibleProjects(
  scope: ProjectScope,
  projectsRepo: ProjectsRepository = new ProjectsRepository()
): Promise<Project[]> {
  if (scope.projectId) {
    const project = await projectsRepo.findById(scope.projectId);
    return project ? [project] : [];
  }

  if (!scope.userId) {
    return [];
  }

  return projectsRepo.listOwned(scope.userId);
}
