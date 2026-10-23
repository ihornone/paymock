import { ProjectsRepository } from '@/server/db/projects.repository';
import { invalidateTokenCacheForProject } from '@/server/auth/token-cache';
import {
  assertProjectAccess,
  listAccessibleProjects,
  ScopeError,
  SCOPE_ERROR_MESSAGE,
  type ProjectScope,
} from '@/server/auth/scope';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Authorization scope of an MCP session.
 *
 *  - a **project token** (`pmk_live_…`): the session is scoped to that single
 *    project;
 *  - a **user token** (`pmk_usr_…`) or a Clerk session: the session is scoped
 *    to every project that user owns.
 *
 * Exactly one of the two is set. A session without any scope is rejected
 * before it reaches a handler.
 */
export type McpScope = ProjectScope;

export interface ProjectsHandlerContext {
  scope: McpScope;
  projectsRepo: ProjectsRepository;
}

/**
 * Verifies that the session is allowed to touch the given project and
 * returns it.
 *
 * This is a thin wrapper around the shared guard in `@/server/auth/scope`,
 * which is also used by the MCP *resources*. The previous split — tools
 * checked ownership, resources did not — is what leaked every tenant's
 * projects (with their plaintext tokens) through `paymock://projects`.
 */
export async function resolveTargetProject(
  requestedProjectId: string | undefined,
  scope: McpScope,
  projectsRepo: ProjectsRepository
) {
  return assertProjectAccess(scope, requestedProjectId, projectsRepo);
}

/**
 * The public shape of a project.
 *
 * The merchant token is never part of it: it is a credential, and a
 * credential has no business in a listing.
 */
function publicProjectView(project: {
  id: string;
  name: string;
  edrpou: string;
  logo_url?: string | null;
  default_webhook_url: string | null;
  default_success_url: string | null;
  default_fail_url: string | null;
  created_at: string;
}) {
  return {
    id: project.id,
    name: project.name,
    edrpou: project.edrpou,
    logoUrl: project.logo_url,
    defaultWebhookUrl: project.default_webhook_url,
    defaultSuccessUrl: project.default_success_url,
    defaultFailUrl: project.default_fail_url,
    createdAt: project.created_at,
  };
}

export async function handleListProjects({
  scope,
  projectsRepo,
}: ProjectsHandlerContext): Promise<CallToolResult> {
  const userProjects = await listAccessibleProjects(scope, projectsRepo);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(userProjects.map(publicProjectView), null, 2),
      },
    ],
  };
}

export async function handleCreateProject(
  args: any,
  { scope, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const { name, defaultWebhookUrl, defaultSuccessUrl, defaultFailUrl, edrpou } = args || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Поле name (назва проєкту) є обов\'язковим.');
  }

  // A project-scoped session is already bound to one project and cannot
  // create another one.
  if (scope.projectId) {
    throw new Error(
      'Поточний токен прив\'язаний до конкретного проєкту і не може створювати нові проєкти. Використайте X-Token акаунта (pmk_usr_…).'
    );
  }

  if (!scope.userId) {
    throw new ScopeError();
  }

  const created = await projectsRepo.create({
    name: name.trim(),
    userId: scope.userId,
    edrpou: edrpou || '12345678',
    defaultWebhookUrl: defaultWebhookUrl || null,
    defaultSuccessUrl: defaultSuccessUrl || null,
    defaultFailUrl: defaultFailUrl || null,
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            message: `✅ Проєкт "${created.project.name}" успішно створено!`,
            project: publicProjectView(created.project),
            // Shown exactly once — only the hash is stored.
            token: created.token,
            webhookSecret: created.webhookSecret,
            envExample: `PAYMOCK_PROJECT_ID=${created.project.id}\nPAYMOCK_TOKEN=${created.token}`,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function handleGetProject(
  args: any,
  { scope, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const target = await resolveTargetProject(args?.projectId, scope, projectsRepo);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(publicProjectView(target), null, 2),
      },
    ],
  };
}

export async function handleResetProjectToken(
  args: any,
  { scope, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const { projectId } = args || {};
  if (!projectId) throw new Error('Потрібно вказати projectId.');

  const target = await resolveTargetProject(projectId, scope, projectsRepo);

  const rotated = await projectsRepo.resetToken(target.id, scope.userId ?? undefined);
  if (!rotated) {
    throw new ScopeError();
  }

  // The rotated-away token must not stay valid in the in-isolate token cache.
  invalidateTokenCacheForProject(rotated.project.id);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            message: `🔑 Новий токен для проєкту "${rotated.project.name}" згенеровано!`,
            projectId: rotated.project.id,
            // Shown exactly once — only the hash is stored.
            newToken: rotated.token,
          },
          null,
          2
        ),
      },
    ],
  };
}

export { SCOPE_ERROR_MESSAGE };
