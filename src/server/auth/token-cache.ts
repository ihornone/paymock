import { ProjectsRepository } from '@/server/db/projects.repository';
import type { Project } from '@/shared/types/models';

/**
 * In-isolate cache for `X-Token` → project resolution.
 *
 * Resolving a token costs one D1 query, and the MCP client resolves the same
 * token on every single request — including pure protocol traffic
 * (`server/discover`, `initialize`, `notifications/initialized`, `ping`).
 * A short TTL removes that query from the hot path.
 *
 * The cache is per-isolate and therefore best-effort: a cold isolate simply
 * repopulates it. Entries are invalidated explicitly when a token is rotated.
 */
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

/**
 * Resolves a merchant token to its project, using the in-isolate cache.
 */
export async function findProjectByToken(
  token: string,
  projectsRepo: ProjectsRepository = new ProjectsRepository()
): Promise<Project | null> {
  const now = Date.now();
  const cached = tokenCache.get(token);

  if (cached) {
    if (now <= cached.expiresAt) {
      return cached.project;
    }
    tokenCache.delete(token);
  }

  const project = await projectsRepo.findByToken(token);

  evictIfNeeded();
  tokenCache.set(token, { project, expiresAt: now + TOKEN_CACHE_TTL_MS });

  return project;
}

/**
 * Drops a token from the cache. Must be called whenever a token is rotated,
 * otherwise the old token stays valid for up to the TTL.
 */
export function invalidateTokenCache(token: string): void {
  tokenCache.delete(token);
}

/**
 * Applies a patch to every cached project with the given id.
 *
 * Without this a mutation (for example setting the merchant logo) stays
 * invisible to the cache and is re-applied on every request until the entry
 * expires.
 */
export function updateCachedProject(
  projectId: string,
  patch: Partial<Project>
): void {
  for (const [token, entry] of tokenCache.entries()) {
    if (entry.project?.id === projectId) {
      entry.project = { ...entry.project, ...patch };
    }
  }
}

/**
 * Clears the whole cache. Used by tests.
 */
export function resetTokenCache(): void {
  tokenCache.clear();
}
