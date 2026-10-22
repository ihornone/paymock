import { ProjectsRepository } from '@/server/db/projects.repository';
import { invalidateTokenCache } from '@/server/auth/token-cache';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ProjectsHandlerContext {
  userId: string;
  projectsRepo: ProjectsRepository;
}

export async function resolveTargetProject(
  requestedProjectId: string | undefined,
  userId: string,
  projectsRepo: ProjectsRepository
) {
  if (requestedProjectId) {
    const proj = await projectsRepo.findById(requestedProjectId, userId);
    if (!proj) {
      throw new Error(`Проєкт з ID ${requestedProjectId} не знайдено або у вас немає до нього доступу.`);
    }
    return proj;
  }
  // Previously this loaded every project of the account just to take the first
  // one. `findFirstByUser` is a single indexed row instead of a full list.
  const project = await projectsRepo.findFirstByUser(userId);
  if (!project) {
    throw new Error('У вашому акаунті ще немає жодного проєкту. Спочатку створіть проєкт через інструмент create_project.');
  }
  return project;
}

export async function handleListProjects({
  userId,
  projectsRepo,
}: ProjectsHandlerContext): Promise<CallToolResult> {
  const userProjects = await projectsRepo.list(userId);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          userProjects.map((p) => ({
            id: p.id,
            name: p.name,
            token: p.token,
            edrpou: p.edrpou,
            defaultWebhookUrl: p.default_webhook_url,
            defaultSuccessUrl: p.default_success_url,
            createdAt: p.created_at,
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
  { userId, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const { name, defaultWebhookUrl, defaultSuccessUrl, defaultFailUrl, edrpou } = args || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Поле name (назва проєкту) є обов\'язковим.');
  }

  const newProject = await projectsRepo.create({
    name: name.trim(),
    userId,
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
  { userId, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const target = await resolveTargetProject(args?.projectId, userId, projectsRepo);
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
            defaultFailUrl: target.default_fail_url,
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
  { userId, projectsRepo }: ProjectsHandlerContext
): Promise<CallToolResult> {
  const { projectId } = args || {};
  if (!projectId) throw new Error('Потрібно вказати projectId.');

  // Read the current token first: the cache must drop the *old* token, and
  // `resetToken` only returns the new one.
  const existing = await projectsRepo.findById(projectId, userId);
  if (!existing) {
    throw new Error(`Не вдалося оновити токен для проєкту ${projectId}. Перевірте права доступу.`);
  }

  const updated = await projectsRepo.resetToken(projectId, userId);
  if (!updated) {
    throw new Error(`Не вдалося оновити токен для проєкту ${projectId}. Перевірте права доступу.`);
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
