import { ProjectsRepository } from '@/server/db/projects.repository';
import { invalidateTokenCache } from '@/server/auth/token-cache';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Authorization scope of an MCP session.
 *
 * There are two ways to authenticate:
 *  - a **project token** (`pmk_live_…`): the session is scoped to that single
 *    project, and `projectId` is null;
 *  - a **user token** (`pmk_usr_…`) or a Clerk session: the session is scoped
 *    to every project that user owns, and `projectId` is null.
 *
 * Exactly one of the two is set. A session without any scope is rejected
 * before it reaches a handler.
 */
export interface McpScope {
  userId: string | null;
  projectId: string | null;
}

export interface ProjectsHandlerContext {
  scope: McpScope;
  projectsRepo: ProjectsRepository;
}

/**
 * Verifies that the session is allowed to touch the given project and
 * returns it.
 *
 * For a project-scoped session the id must match exactly. For a user-scoped
 * session the project must belong to that user — the check is done in SQL so
 * it cannot be bypassed.
 */
export async function resolveTargetProject(
  requestedProjectId: string | undefined,
  scope: McpScope,
  projectsRepo: ProjectsRepository
) {
  if (scope.projectId) {
    if (requestedProjectId && requestedProjectId !== scope.projectId) {
      throw new Error(
        `Проєкт з ID ${requestedProjectId} недоступний для цього токена. Дозволено лише проєкт ${scope.projectId}.`
      );
    }
    const project = await projectsRepo.findById(scope.projectId);
    if (!project) {
      throw new Error(`Проєкт ${scope.projectId} не знайдено.`);
    }
    return project;
  }

  if (!scope.userId) {
    throw new Error('Відсутній контекст авторизації. Передайте валідний X-Token.');
  }

  if (requestedProjectId) {
    const project = await projectsRepo.findById(requestedProjectId, scope.userId);
    if (!project) {
      throw new Error(
        `Проєкт з ID ${requestedProjectId} не знайдено або у вас немає до нього доступу.`
      );
    }
    return project;
  }

  // The default project of the account — a single indexed row instead of
  // loading the whole list.
  const project = await projectsRepo.findFirstByUser(scope.userId);
  if (!project) {
    throw new Error(
      'У вашому акаунті ще немає жодного проєкту. Спочатку створіть проєкт через інструмент create_project.'
    );
  }
  return project;
}

export async function handleListProjects({
  scope,
  projectsRepo,
}: ProjectsHandlerContext): Promise<CallToolResult> {
  const userProjects =
    scope.projectId
      ? [await projectsRepo.findById(scope.projectId)].filter(Boolean)
      : await projectsRepo.list(scope.userId);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          userProjects.map((p) => ({
            id: p!.id,
            name: p!.name,
            token: p!.token,
            edrpou: p!.edrpou,
            defaultWebhookUrl: p!.default_webhook_url,
            defaultSuccessUrl: p!.default_success_url,
            createdAt: p!.created_at,
          })),
          null,
          2
        ),
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

  const newProject = await projectsRepo.create({
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
            message: `✅ Проєкт "${newProject.name}" успішно створено!`,
            project: {
              id: newProject.id,
              name: newProject.name,
              token: newProject.token,
              edrpou: newProject.edrpou,
              defaultWebhookUrl: newProject.default_webhook_url,
            },
            envExample: `PAYMOCK_PROJECT_ID=${newProject.id}\nPAYMOCK_TOKEN=${newProject.token}`,
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
        text: JSON.stringify(
          {
            id: target.id,
            name: target.name,
            token: target.token,
            edrpou: target.edrpou,
            defaultWebhookUrl: target.default_webhook_url,
            defaultSuccessUrl: target.default_success_url,
            createdAt: target.created_at,
          },
          null,
          2
        ),
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

  // Read the current token first: the cache must drop the *old* token, and
  // `resetToken` only returns the new one.
  const existing = await projectsRepo.findById(target.id);
  if (!existing) {
    throw new Error(`Не вдалося оновити токен для проєкту ${target.id}. Перевірте права доступу.`);
  }

  const updated = await projectsRepo.resetToken(target.id, scope.userId ?? undefined);
  if (!updated) {
    throw new Error(`Не вдалося оновити токен для проєкту ${target.id}. Перевірте права доступу.`);
  }

  // The rotated-away token must not stay valid in the in-isolate token cache.
  invalidateTokenCache(existing.token);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            message: `🔑 Новий токен для проєкту "${updated.name}" згенеровано!`,
            projectId: updated.id,
            newToken: updated.token,
          },
          null,
          2
        ),
      },
    ],
  };
}
