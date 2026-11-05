import { ProjectsRepository } from '@/server/db/projects.repository';
import { hashProjectToken } from './project-token';
import type { Project } from '@/shared/types/models';

export const TOKEN_CACHE_TTL_MS = 60_000;
export const MAX_TOKEN_CACHE_ENTRIES = 1_000;

interface CacheEntry {
  project: Project | null;
  expiresAt: number;
}

const tokenCache = new Map<string, CacheEntry>();

function evictIfNeeded(): void {
  if (tokenCache.size < MAX_TOKEN_CACHE_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of tokenCache.entries()) {
    if (now > entry.expiresAt) {
      tokenCache.delete(key);
    }
  }

  while (tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
    const oldestKey = tokenCache.keys().next().value;
    if (oldestKey === undefined) break;
    tokenCache.delete(oldestKey);
  }
}

export async function findProjectByToken(
  token: string,
  projectsRepo: ProjectsRepository = new ProjectsRepository()
): Promise<Project | null> {
  const tokenHash = await hashProjectToken(token);
  const now = Date.now();
  const cached = tokenCache.get(tokenHash);

  if (cached) {
    if (now <= cached.expiresAt) {
      return cached.project;
    }
    tokenCache.delete(tokenHash);
  }

  const project = await projectsRepo.findByTokenHash(tokenHash);

  evictIfNeeded();
  tokenCache.set(tokenHash, { project, expiresAt: now + TOKEN_CACHE_TTL_MS });

  return project;
}

export function invalidateTokenCacheForProject(projectId: string): void {
  for (const [key, entry] of tokenCache.entries()) {
    if (entry.project?.id === projectId) {
      tokenCache.delete(key);
    }
  }
}

export function updateCachedProject(
  projectId: string,
  patch: Partial<Project>
): void {
  for (const entry of tokenCache.values()) {
    if (entry.project?.id === projectId) {
      entry.project = { ...entry.project, ...patch };
    }
  }
}

export function resetTokenCache(): void {
  tokenCache.clear();
}
