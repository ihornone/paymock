import { ProjectsRepository } from '@/server/db/projects.repository';
import type { Project } from '@/shared/types/models';

/**
 * Authorization scope of a session.
 *
 * Exactly one of `userId` / `projectId` is set:
 *  - a personal access token or a Clerk session scopes the session to every
 *    project the account owns;
 *  - a project token scopes it to that single project.
 */
export interface ProjectScope {
  userId: string | null;
  projectId: string | null;
}

/**
 * The neutral error every scope violation resolves to.
 *
 * The message must not contain the id of a foreign project: distinguishing
 * "exists but not yours" from "does not exist" turns the endpoint into an
 * oracle for enumerating other tenants' project ids.
 */
export const SCOPE_ERROR_MESSAGE = 'Resource not found or unauthorized';

export class ScopeError extends Error {
  readonly status: number;

  constructor(message: string = SCOPE_ERROR_MESSAGE, status: number = 403) {
    super(message);
    this.name = 'ScopeError';
    this.status = status;
  }
}

/**
 * Resolves a project the session is allowed to touch.
 *
 * This is the single guard used by **both** MCP tools and MCP resources —
 * the previous split (tools checked, resources did not) is what leaked every
 * tenant's projects to any MCP client.
 *
 * @param scope         the session scope
 * @param projectId     the requested project, or `undefined` for the default project
 * @param projectsRepo  repository to read from
 */
export async function assertProjectAccess(
  scope: ProjectScope,
  projectId?: string | null,
  projectsRepo: ProjectsRepository = new ProjectsRepository()
): Promise<Project> {
  // A project-scoped session may only ever touch its own project.
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

/**
 * Lists the projects a session is allowed to see.
 *
 * A project-scoped session sees exactly one project; an account-scoped
 * session sees its own projects and nothing else.
 */
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
